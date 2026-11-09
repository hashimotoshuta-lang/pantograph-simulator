
"use strict";

/* =========================================
   パンタグラフ・シミュレーター
   幾何拘束計算エンジン

   ・棒は剛体
   ・穴の位置は固定
   ・連結された穴の座標は一致
   ・固定点の座標を維持
   ・ドラッグした穴の目標位置を指定可能
   ・既存の配置に近い解を優先
========================================= */


/* =========================================
   基本計算
========================================= */

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}


function getRodHolePosition(rod, holeIndex) {
  const holeCount = rod.divisionCount + 2;
  const ratio = holeIndex / (holeCount - 1);
  const localX = rod.length * ratio;

  return {
    x: rod.x + localX * Math.cos(rod.angle),
    y: rod.y + localX * Math.sin(rod.angle)
  };
}


/* =========================================
   連立一次方程式を解く
   ガウス・ジョルダン法
========================================= */

function solveLinearSystem(matrix, vector) {
  const n = vector.length;
  if (n === 0) return [];

  const a = matrix.map((row, i) => [...row, vector[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;

    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) {
        pivot = row;
      }
    }

    if (Math.abs(a[pivot][col]) < 1e-12) return null;

    [a[col], a[pivot]] = [a[pivot], a[col]];

    const divisor = a[col][col];

    for (let j = col; j <= n; j++) {
      a[col][j] /= divisor;
    }

    for (let row = 0; row < n; row++) {
      if (row === col) continue;

      const factor = a[row][col];

      for (let j = col; j <= n; j++) {
        a[row][j] -= factor * a[col][j];
      }
    }
  }

  return a.map(row => row[n]);
}


/* =========================================
   連結条件の残差
========================================= */

function calculateConstraintResiduals(rods, connections) {
  const residuals = [];

  connections.forEach(connection => {
    const rodA = rods.find(rod => rod.id === connection.rodA);
    const rodB = rods.find(rod => rod.id === connection.rodB);

    if (!rodA || !rodB) return;

    const pointA = getRodHolePosition(rodA, connection.holeA);
    const pointB = getRodHolePosition(rodB, connection.holeB);

    residuals.push(pointA.x - pointB.x);
    residuals.push(pointA.y - pointB.y);
  });

  return residuals;
}


/* =========================================
   固定点条件の残差

   fixedPoints:
   {
     rodId,
     holeIndex,
     x,
     y
   }
========================================= */

function calculateFixedPointResiduals(rods, fixedPoints) {
  const residuals = [];

  (fixedPoints || []).forEach(fixedPoint => {
    const rod = rods.find(item => item.id === fixedPoint.rodId);
    if (!rod) return;

    const position = getRodHolePosition(rod, fixedPoint.holeIndex);

    residuals.push(position.x - fixedPoint.x);
    residuals.push(position.y - fixedPoint.y);
  });

  return residuals;
}


/* =========================================
   すべての計算用残差

   1. 連結条件
   2. 固定点条件
   3. ドラッグ目標
   4. 元の配置からの変化
========================================= */

function calculateSolverResiduals(
  rods,
  connections,
  referenceRods,
  options
) {
  const residuals = [];

  const constraintWeight =
    Math.sqrt(options.constraintWeight ?? 1000);

  const fixedPointWeight =
    Math.sqrt(options.fixedPointWeight ?? 10000);

  const targetWeight =
    Math.sqrt(options.targetWeight ?? 1);

  const poseWeight =
    Math.sqrt(options.poseWeight ?? 0.0001);


  // 1. 連結条件
  calculateConstraintResiduals(rods, connections).forEach(value => {
    residuals.push(value * constraintWeight);
  });


  // 2. 固定点条件
  calculateFixedPointResiduals(
    rods,
    options.fixedPoints || []
  ).forEach(value => {
    residuals.push(value * fixedPointWeight);
  });


  // 3. ドラッグ目標
  if (options.targetPoint) {
    const target = options.targetPoint;

    const targetRod = rods.find(rod => rod.id === target.rodId);

    if (targetRod) {
      const point = getRodHolePosition(targetRod, target.holeIndex);

      residuals.push((point.x - target.x) * targetWeight);
      residuals.push((point.y - target.y) * targetWeight);
    }
  }


  // 4. 元の配置からの変化を抑える
  if (referenceRods && options.targetPoint) {
    rods.forEach(rod => {
      const reference = referenceRods.find(item => item.id === rod.id);
      if (!reference) return;

      residuals.push((rod.x - reference.x) * poseWeight);
      residuals.push((rod.y - reference.y) * poseWeight);

      residuals.push(
        normalizeAngle(rod.angle - reference.angle) * poseWeight
      );
    });
  }

  return residuals;
}


/* =========================================
   誤差
========================================= */

function calculateError(residuals) {
  return residuals.reduce((sum, value) => sum + value * value, 0);
}


/* =========================================
   数値ヤコビ行列
========================================= */

function calculateJacobian(
  rods,
  connections,
  movableRods,
  referenceRods,
  options
) {
  const baseResiduals = calculateSolverResiduals(
    rods,
    connections,
    referenceRods,
    options
  );

  const jacobian = baseResiduals.map(() => []);
  const epsilon = 1e-5;

  let variableIndex = 0;

  movableRods.forEach(rod => {
    ["x", "y", "angle"].forEach(property => {
      const originalValue = rod[property];

      rod[property] = originalValue + epsilon;

      const changedResiduals = calculateSolverResiduals(
        rods,
        connections,
        referenceRods,
        options
      );

      rod[property] = originalValue;

      for (let i = 0; i < baseResiduals.length; i++) {
        jacobian[i][variableIndex] =
          (changedResiduals[i] - baseResiduals[i]) / epsilon;
      }

      variableIndex++;
    });
  });

  return jacobian;
}


/* =========================================
   幾何拘束を満たす配置を計算

   options:
   fixedRodId:
     固定する棒のID

   fixedPoints:
     [{ rodId, holeIndex, x, y }]

   targetPoint:
     { rodId, holeIndex, x, y }

   referenceRods:
     計算の基準となる棒の配置
========================================= */

function solveRodConstraints(
  originalRods,
  connections,
  options = {}
) {
  const rods = originalRods.map(rod => ({ ...rod }));

  const fixedRodId = options.fixedRodId ?? null;
  const fixedPoints = options.fixedPoints || [];

  const maxIterations = options.maxIterations ?? 300;
  const constraintTolerance = options.tolerance ?? 1e-4;
  const targetTolerance = options.targetTolerance ?? 1.5;
  const fixedPointTolerance = options.fixedPointTolerance ?? 0.05;

  const movableRods = rods.filter(rod => rod.id !== fixedRodId);
  const referenceRods = options.referenceRods ?? originalRods;

  // 拘束条件が何もない場合
  if (
    connections.length === 0 &&
    fixedPoints.length === 0 &&
    !options.targetPoint
  ) {
    return {
      success: true,
      rods,
      error: 0,
      targetError: 0,
      fixedPointError: 0,
      iterations: 0
    };
  }

  // 変数がない場合も誤差を評価する
  if (movableRods.length === 0) {
    const constraintError = Math.sqrt(
      calculateError(calculateConstraintResiduals(rods, connections))
    );

    const fixedPointError = Math.sqrt(
      calculateError(calculateFixedPointResiduals(rods, fixedPoints))
    );

    let targetError = 0;

    if (options.targetPoint) {
      const target = options.targetPoint;
      const targetRod = rods.find(rod => rod.id === target.rodId);

      if (targetRod) {
        const p = getRodHolePosition(targetRod, target.holeIndex);
        targetError = Math.hypot(p.x - target.x, p.y - target.y);
      }
    }

    return {
      success:
        constraintError <= constraintTolerance &&
        fixedPointError <= fixedPointTolerance &&
        (!options.targetPoint || targetError <= targetTolerance),
      rods,
      error: constraintError,
      targetError,
      fixedPointError,
      iterations: 0
    };
  }


  let damping = 1e-3;

  let residuals = calculateSolverResiduals(
    rods,
    connections,
    referenceRods,
    options
  );

  let error = calculateError(residuals);

  let bestRods = rods.map(rod => ({ ...rod }));
  let bestError = error;
  let completedIterations = 0;


  for (let iteration = 0; iteration < maxIterations; iteration++) {
    completedIterations = iteration + 1;

    const jacobian = calculateJacobian(
      rods,
      connections,
      movableRods,
      referenceRods,
      options
    );

    const variableCount = movableRods.length * 3;

    const normalMatrix = Array.from(
      { length: variableCount },
      () => Array(variableCount).fill(0)
    );

    const gradient = Array(variableCount).fill(0);


    // 正規方程式を作る
    for (let i = 0; i < variableCount; i++) {
      for (let j = 0; j < variableCount; j++) {
        for (let k = 0; k < residuals.length; k++) {
          normalMatrix[i][j] += jacobian[k][i] * jacobian[k][j];
        }
      }

      for (let k = 0; k < residuals.length; k++) {
        gradient[i] -= jacobian[k][i] * residuals[k];
      }

      normalMatrix[i][i] += damping;
    }


    const delta = solveLinearSystem(normalMatrix, gradient);
    if (!delta) break;


    const previousValues = movableRods.map(rod => ({
      rod,
      x: rod.x,
      y: rod.y,
      angle: rod.angle
    }));


    // 棒を動かす
    let index = 0;

    movableRods.forEach(rod => {
      rod.x += delta[index++];
      rod.y += delta[index++];
      rod.angle = normalizeAngle(rod.angle + delta[index++]);
    });


    const nextResiduals = calculateSolverResiduals(
      rods,
      connections,
      referenceRods,
      options
    );

    const nextError = calculateError(nextResiduals);


    if (nextError < error) {
      residuals = nextResiduals;
      error = nextError;

      if (error < bestError) {
        bestError = error;
        bestRods = rods.map(rod => ({ ...rod }));
      }

      damping = Math.max(damping * 0.5, 1e-9);

      if (Math.abs(bestError) < 1e-14) break;

    } else {
      // 改善しなければ元に戻す
      previousValues.forEach(previous => {
        previous.rod.x = previous.x;
        previous.rod.y = previous.y;
        previous.rod.angle = previous.angle;
      });

      damping *= 10;
      if (damping > 1e12) break;
    }
  }


  const solvedRods = bestRods;


  // 連結条件の誤差
  const constraintError = Math.sqrt(
    calculateError(
      calculateConstraintResiduals(solvedRods, connections)
    )
  );


  // 固定点条件の誤差
  const fixedPointError = Math.sqrt(
    calculateError(
      calculateFixedPointResiduals(solvedRods, fixedPoints)
    )
  );


  // 目標位置の誤差
  let targetError = 0;

  if (options.targetPoint) {
    const target = options.targetPoint;
    const targetRod = solvedRods.find(rod => rod.id === target.rodId);

    if (targetRod) {
      const point = getRodHolePosition(targetRod, target.holeIndex);
      targetError = Math.hypot(point.x - target.x, point.y - target.y);
    }
  }


  const success =
    constraintError <= constraintTolerance &&
    fixedPointError <= fixedPointTolerance &&
    (!options.targetPoint || targetError <= targetTolerance);


  return {
    success,
    rods: solvedRods,
    error: constraintError,
    targetError,
    fixedPointError,
    iterations: completedIterations
  };
}
