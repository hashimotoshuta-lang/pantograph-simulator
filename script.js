
"use strict";

/* =========================================
   パンタグラフ・シミュレーター
   STEP 12：固定点・軌跡機能
========================================= */
// 図形描画用SVG要素
const figureLayer = document.getElementById("figureLayer");

// モード切り替え
const assemblyModeBtn = document.getElementById("assemblyModeBtn");
const drawingModeBtn = document.getElementById("drawingModeBtn");
const assemblyControls = document.getElementById("assemblyControls");
const drawingControls = document.getElementById("drawingControls");

// 図形描画操作
const drawingStatus = document.getElementById("drawingStatus");
const clearFigureBtn = document.getElementById("clearFigureBtn");
const undoDrawingBtn = document.getElementById("undoDrawingBtn");
// SVG要素
const drawingArea = document.getElementById("drawingArea");
const rodLayer = document.getElementById("rodLayer");
const connectionLayer = document.getElementById("connectionLayer");
const pointLayer = document.getElementById("pointLayer");
const traceLayer = document.getElementById("traceLayer");

// 入力欄
const rodLengthInput = document.getElementById("rodLength");
const divisionCountInput = document.getElementById("divisionCount");
const addRodBtn = document.getElementById("addRodBtn");
// 棒の削除操作
const deleteRodBtn = document.getElementById("deleteRodBtn");
const deleteRodStatus = document.getElementById("deleteRodStatus");
// 連結操作
const connectionModeBtn = document.getElementById("connectionModeBtn");
const connectionStatus = document.getElementById("connectionStatus");
const removeConnectionModeBtn = document.getElementById("removeConnectionModeBtn");
const removeConnectionStatus = document.getElementById("removeConnectionStatus");
// 点の設定操作
const fixedPointModeBtn = document.getElementById("fixedPointModeBtn");
const removeFixedPointModeBtn = document.getElementById("removeFixedPointModeBtn");
const markerPointModeBtn = document.getElementById("markerPointModeBtn");
const penPointModeBtn = document.getElementById("penPointModeBtn");
const moveMarkerPointModeBtn = document.getElementById("moveMarkerPointModeBtn");
const movePenPointModeBtn = document.getElementById("movePenPointModeBtn");
const penToggleBtn = document.getElementById("penToggleBtn");
const cancelPointModeBtn = document.getElementById("cancelPointModeBtn");
const pointSettingStatus = document.getElementById("pointSettingStatus");
const clearTraceBtn = document.getElementById("clearTraceBtn");


// =========================================
// データ
// =========================================

let rods = [];
let connections = [];
let nextRodId = 1;
let selectedRodId = null;
let dragState = null;

let connectionMode = false;
let connectionRemovalMode = false;
let pendingHole = null;

let pointSettingMode = null;
let selectedPointForMove = null;
let fixedPointRemovalMode = false;
let points = [];
let nextPointId = 1;

// { pointId, positions: [{x,y}, ...] }
let tracePoints = [];
let penEnabled = true;
// モード・自由描画の状態
let currentMode = "assembly";
let isDrawing = false;
let currentStroke = null;
let figureStrokes = [];

/* =========================================
   SVG座標
========================================= */

function getSVGPoint(event) {
  const point = drawingArea.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;

  return point.matrixTransform(
    drawingArea.getScreenCTM().inverse()
  );
}


/* =========================================
   棒・穴の取得
========================================= */

function getRodById(id) {
  return rods.find(rod => rod.id === Number(id));
}


function getHolePosition(rod, holeIndex) {
  const holeCount = rod.divisionCount + 2;
  const ratio = holeIndex / (holeCount - 1);
  const localX = rod.length * ratio;
  const angle = rod.angle * Math.PI / 180;

  return {
    x: rod.x + localX * Math.cos(angle),
    y: rod.y + localX * Math.sin(angle)
  };
}


function getFixedPointsForRod(rodId) {
  return points.filter(point =>
    point.type === "fixed" && point.rodId === rodId
  );
}


/* =========================================
   点の追加
========================================= */

function addPointToHole(rodId, holeIndex) {
  if (pointSettingMode === null) return;

  // =====================================
  // 既存の点の位置変更
  // =====================================

  if (
    pointSettingMode === "moveMarker" ||
    pointSettingMode === "movePen"
  ) {
    const targetType =
      pointSettingMode === "moveMarker"
        ? "marker"
        : "pen";

    if (!selectedPointForMove) {
      pointSettingStatus.textContent =
        "先に移動したい点をクリックしてください。";
      return;
    }

    const point = points.find(
      p => p.id === selectedPointForMove.id
    );

    if (!point) {
      selectedPointForMove = null;
      pointSettingStatus.textContent =
        "移動対象の点が見つかりません。";
      renderRods();
      return;
    }

    // 同じ種類の点が既にある場所には移動できない
    const exists = points.some(p =>
      p.id !== point.id &&
      p.type === targetType &&
      p.rodId === rodId &&
      p.holeIndex === holeIndex
    );

    if (exists) {
      pointSettingStatus.textContent =
        "その穴には同じ種類の点が既にあります。別の穴を選択してください。";
      return;
    }

    // 位置を変更
    point.rodId = rodId;
    point.holeIndex = holeIndex;

    // ペンの場合は、新しい軌跡の記録領域を作る
    // 移動前の軌跡はそのまま残す
    if (targetType === "pen") {
      tracePoints.push({
        pointId: point.id,
        positions: []
      });
    }

    const pointName =
      targetType === "marker"
        ? "なぞる点"
        : "ペン";

    pointSettingMode = null;
    selectedPointForMove = null;

    updatePointModeButtons();

    pointSettingStatus.textContent =
      `${pointName}の位置を棒${rodId}の穴${holeIndex + 1}に変更しました。`;

    renderRods();
    return;
  }

  // =====================================
  // 通常の点の追加
  // =====================================

  const exists = points.some(point =>
    point.rodId === rodId &&
    point.holeIndex === holeIndex &&
    point.type === pointSettingMode
  );

  if (exists) {
    pointSettingStatus.textContent =
      "この位置には同じ種類の点が設定されています。";
    return;
  }

  const newPoint = {
    id: nextPointId++,
    type: pointSettingMode,
    rodId,
    holeIndex
  };

  // 固定点は設定時の座標を保存する
  if (pointSettingMode === "fixed") {
    const rod = getRodById(rodId);
    const position = getHolePosition(rod, holeIndex);

    newPoint.anchorX = position.x;
    newPoint.anchorY = position.y;
  }

  points.push(newPoint);

  if (pointSettingMode === "pen") {
    tracePoints.push({
      pointId: newPoint.id,
      positions: []
    });
  }

  const pointNames = {
    fixed: "固定点",
    marker: "なぞる点",
    pen: "ペンの位置"
  };

  pointSettingStatus.textContent =
    `棒${rodId}の穴${holeIndex + 1}に${pointNames[pointSettingMode]}を設定しました。`;

  renderRods();
}


/* =========================================
   固定点データを取得
========================================= */

function getFixedPointConstraints(rodIds) {
  const idSet = new Set(rodIds);

  return points
    .filter(point =>
      point.type === "fixed" && idSet.has(point.rodId)
    )
    .map(point => ({
      rodId: point.rodId,
      holeIndex: point.holeIndex,
      x: point.anchorX,
      y: point.anchorY
    }));
}


/* =========================================
   ペンの軌跡
========================================= */

function recordPenTraces() {
  if (!penEnabled) return;

  points
    .filter(point => point.type === "pen")
    .forEach(point => {
      const rod = getRodById(point.rodId);
      if (!rod) return;

      // このペンの最新の軌跡区間を取得
      let trace = null;

      for (let i = tracePoints.length - 1; i >= 0; i--) {
        if (
          tracePoints[i].pointId === point.id &&
          tracePoints[i].active
        ) {
          trace = tracePoints[i];
          break;
        }
      }

      // 記録中の軌跡がなければ新しく作る
      if (!trace) {
        trace = {
          pointId: point.id,
          positions: [],
          active: true
        };

        tracePoints.push(trace);
      }

      const position = getHolePosition(
        rod,
        point.holeIndex
      );

      const previous =
        trace.positions[trace.positions.length - 1];

      // ごく小さな移動は記録しない
      if (
        previous &&
        Math.hypot(
          position.x - previous.x,
          position.y - previous.y
        ) < 0.75
      ) {
        return;
      }

      trace.positions.push({
        x: position.x,
        y: position.y
      });
    });
}



function renderTrace() {
  if (!traceLayer) return;

  traceLayer.innerHTML = "";

  tracePoints.forEach(trace => {
    if (trace.positions.length < 2) return;

    const polyline = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "polyline"
    );

    polyline.setAttribute(
      "points",
      trace.positions
        .map(position => `${position.x},${position.y}`)
        .join(" ")
    );

    polyline.setAttribute("fill", "none");
    polyline.setAttribute("stroke", "#43a047");
    polyline.setAttribute("stroke-width", "2.5");
    polyline.setAttribute("stroke-linecap", "round");
    polyline.setAttribute("stroke-linejoin", "round");
    polyline.setAttribute("class", "pen-trace");

    traceLayer.appendChild(polyline);
  });
}


function togglePen() {
  penEnabled = !penEnabled;

  // OFFにしたら、現在の軌跡区間を終了する
  if (!penEnabled) {
    tracePoints.forEach(trace => {
      trace.active = false;
    });
  }

  penToggleBtn.textContent = penEnabled
    ? "ペン：ON"
    : "ペン：OFF";

  penToggleBtn.classList.toggle("active", penEnabled);

  // 表示も更新
  if (typeof renderTrace === "function") {
    renderTrace();
  }
}

function clearTraces() {
  tracePoints.forEach(trace => {
    trace.positions = [];
  });

  renderTrace();

  pointSettingStatus.textContent =
    "ペンの軌跡を消去しました。";
}


/* =========================================
   点の描画
========================================= */

function renderPoints() {
  pointLayer.innerHTML = "";

  const colors = {
    fixed: "#e53935",
    marker: "#2196f3",
    pen: "#43a047"
  };

  points.forEach(point => {
    const rod = getRodById(point.rodId);
    if (!rod) return;

    const position = getHolePosition(rod, point.holeIndex);

    const circle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle"
    );

    circle.setAttribute("cx", position.x);
    circle.setAttribute("cy", position.y);
    circle.setAttribute("r", 6);
    circle.setAttribute(
      "class",
      `simulator-point simulator-point-${point.type}`
    );
    circle.setAttribute("fill", colors[point.type]);
    circle.setAttribute("stroke", "#ffffff");
    circle.setAttribute("stroke-width", 2);

    // 固定点解除モード
    if (fixedPointRemovalMode && point.type === "fixed") {
      circle.style.cursor = "pointer";

      circle.addEventListener("pointerdown", event => {
        event.stopPropagation();
        event.preventDefault();
      });

      circle.addEventListener("click", event => {
        event.stopPropagation();

        points = points.filter(p => p.id !== point.id);

        fixedPointRemovalMode = false;

        removeFixedPointModeBtn.classList.remove("active");
        removeFixedPointModeBtn.textContent = "固定点解除モード";

        pointSettingStatus.textContent =
          "固定点を1つ解除しました。";

        renderRods();
      });
    }

    // 移動対象の点を選択するモード
    const moveTargetType =
      pointSettingMode === "moveMarker"
        ? "marker"
        : pointSettingMode === "movePen"
          ? "pen"
          : null;

    if (moveTargetType === point.type) {
      circle.style.cursor = "pointer";

      // 選択中の点を強調
      if (
        selectedPointForMove &&
        selectedPointForMove.id === point.id
      ) {
        circle.setAttribute("stroke", "#ff9800");
        circle.setAttribute("stroke-width", 4);
      }

      circle.addEventListener("click", event => {
        event.stopPropagation();

        selectedPointForMove = point;

        pointSettingStatus.textContent =
          `棒${point.rodId}の点を選択しました。移動先の穴をクリックしてください。`;

        renderPoints();
      });
    }

    // なぞる点は通常モードでドラッグ可能
    else if (
      point.type === "marker" &&
      pointSettingMode === null &&
      !connectionMode &&
      !fixedPointRemovalMode
    ) {
      circle.style.cursor = "grab";

      circle.addEventListener("pointerdown", event => {
        startMarkerDrag(event, point);
      });
    }

    pointLayer.appendChild(circle);
  });
}


/* =========================================
   幾何拘束エンジンとの連携
========================================= */

function solveMechanism(
  candidateConnections,
  fixedRodId = null,
  solverOptions = {}
) {
  const startId =
    fixedRodId ??
    solverOptions.targetPoint?.rodId;

  if (startId === undefined || startId === null) {
    return {
      success: false,
      error: Infinity
    };
  }

  // 連結機構を特定
  const connectedIds = new Set([startId]);
  const queue = [startId];

  while (queue.length > 0) {
    const currentId = queue.shift();

    candidateConnections.forEach(connection => {
      let nextId = null;

      if (connection.rodA === currentId) {
        nextId = connection.rodB;
      } else if (connection.rodB === currentId) {
        nextId = connection.rodA;
      }

      if (nextId !== null && !connectedIds.has(nextId)) {
        connectedIds.add(nextId);
        queue.push(nextId);
      }
    });
  }

  const componentRods = rods.filter(
    rod => connectedIds.has(rod.id)
  );

  const componentConnections = candidateConnections.filter(
    connection =>
      connectedIds.has(connection.rodA) &&
      connectedIds.has(connection.rodB)
  );

  const solverRods = componentRods.map(rod => ({
    ...rod,
    angle: rod.angle * Math.PI / 180
  }));

  const referencePositions = solverOptions.referencePositions;

  const referenceRods = referencePositions
    ? componentRods.map(rod => {
        const reference = referencePositions.find(
          position => position.rod.id === rod.id
        );

        if (!reference) return { ...rod };

        return {
          ...rod,
          x: reference.x,
          y: reference.y,
          angle: reference.angle * Math.PI / 180
        };
      })
    : solverRods.map(rod => ({ ...rod }));


  // この連結機構に属する固定点
  const fixedPoints = getFixedPointConstraints(connectedIds);


  const result = solveRodConstraints(
    solverRods,
    componentConnections,
    {
      fixedRodId,

      fixedPoints,

      maxIterations:
        solverOptions.maxIterations ?? 100,

      tolerance:
        solverOptions.tolerance ?? 1e-4,

      targetTolerance:
        solverOptions.targetTolerance ?? 2,

      fixedPointTolerance:
        solverOptions.fixedPointTolerance ?? 0.05,

      targetPoint:
        solverOptions.targetPoint,

      referenceRods,

      constraintWeight:
        solverOptions.constraintWeight ?? 1000,

      fixedPointWeight:
        solverOptions.fixedPointWeight ?? 10000,

      targetWeight:
        solverOptions.targetWeight ?? 1,

      poseWeight:
        solverOptions.poseWeight ?? 0.0001
    }
  );

  if (!result.success) return result;

  const solvedRods = new Map(
    result.rods.map(rod => [rod.id, rod])
  );

  componentRods.forEach(rod => {
    const solved = solvedRods.get(rod.id);
    if (!solved) return;

    rod.x = solved.x;
    rod.y = solved.y;
    rod.angle = solved.angle * 180 / Math.PI;
  });

  return result;
}


/* =========================================
   穴・棒の連結状況
========================================= */

function getHoleConnectionCount(rodId, holeIndex) {
  return connections.filter(connection => (
    (connection.rodA === rodId && connection.holeA === holeIndex) ||
    (connection.rodB === rodId && connection.holeB === holeIndex)
  )).length;
}


function isHoleConnected(rodId, holeIndex) {
  return getHoleConnectionCount(rodId, holeIndex) > 0;
}


function isRodConnected(rodId) {
  return connections.some(connection =>
    connection.rodA === rodId ||
    connection.rodB === rodId
  );
}


/* =========================================
   連結している棒をすべて取得
========================================= */

function getConnectedRodIds(startRodId) {
  const visited = new Set([startRodId]);
  const queue = [startRodId];

  while (queue.length > 0) {
    const currentId = queue.shift();

    connections.forEach(connection => {
      let nextId = null;

      if (connection.rodA === currentId) {
        nextId = connection.rodB;
      } else if (connection.rodB === currentId) {
        nextId = connection.rodA;
      }

      if (nextId !== null && !visited.has(nextId)) {
        visited.add(nextId);
        queue.push(nextId);
      }
    });
  }

  return [...visited];
}


/* =========================================
   指定した連結を除いて棒をたどる
========================================= */

function getComponentWithoutConnection(
  startRodId,
  excludedConnectionId
) {
  const visited = new Set([startRodId]);
  const queue = [startRodId];

  while (queue.length > 0) {
    const currentId = queue.shift();

    connections.forEach(connection => {
      if (connection.id === excludedConnectionId) return;

      let nextId = null;

      if (connection.rodA === currentId) {
        nextId = connection.rodB;
      } else if (connection.rodB === currentId) {
        nextId = connection.rodA;
      }

      if (nextId !== null && !visited.has(nextId)) {
        visited.add(nextId);
        queue.push(nextId);
      }
    });
  }

  return [...visited];
}


/* =========================================
   棒の追加
========================================= */

function addRod() {
  const length = Number(rodLengthInput.value);
  const divisionCount = Number(divisionCountInput.value);

  if (!Number.isFinite(length) || length < 50 || length > 1000) {
    alert("棒の長さは50～1000の範囲で指定してください。");
    return;
  }

  if (
    !Number.isInteger(divisionCount) ||
    divisionCount < 1 ||
    divisionCount > 20
  ) {
    alert("内分点の個数は1～20の整数で指定してください。");
    return;
  }

  const index = rods.length;

  rods.push({
    id: nextRodId++,
    length,
    divisionCount,
    x: 250 + (index % 4) * 35,
    y: 200 + Math.floor(index / 4) * 80,
    angle: 0
  });

  renderRods();
}


/* =========================================
   連結モード
========================================= */

function toggleConnectionMode() {
  connectionMode = !connectionMode;
  pendingHole = null;

  // 点の設定モードを解除
  if (connectionMode) {
    pointSettingMode = null;
    updatePointModeButtons();
  }

  connectionModeBtn.classList.toggle("active", connectionMode);

  connectionModeBtn.textContent = connectionMode
    ? "連結モード：ON"
    : "連結モード：OFF";

  connectionStatus.textContent = connectionMode
    ? "1本目の棒の未使用の穴を選択してください。"
    : "連結モードをOFFにしました。";

  renderRods();
}
function toggleConnectionRemovalMode() {
  connectionRemovalMode = !connectionRemovalMode;

  // ほかの操作モードを解除
  connectionMode = false;
  pendingHole = null;
  pointSettingMode = null;
  fixedPointRemovalMode = false;

  updateConnectionUI();
  updatePointModeButtons();

  // 固定点解除モードもOFFにする
  removeFixedPointModeBtn.classList.remove("active");
  removeFixedPointModeBtn.textContent = "固定点解除モード";

  // 連結解除ボタンの表示を更新
  removeConnectionModeBtn.classList.toggle(
    "active",
    connectionRemovalMode
  );

  removeConnectionModeBtn.textContent =
    connectionRemovalMode
      ? "連結解除モード：ON"
      : "連結解除モード：OFF";

  removeConnectionStatus.textContent =
    connectionRemovalMode
      ? "解除したい連結線をクリックしてください。"
      : "連結解除モードをOFFにしました。";

  renderRods();
}

/* =========================================
   点の設定モード
========================================= */
function updatePointModeButtons() {
  fixedPointModeBtn.classList.toggle(
    "active",
    pointSettingMode === "fixed"
  );

  markerPointModeBtn.classList.toggle(
    "active",
    pointSettingMode === "marker"
  );

  penPointModeBtn.classList.toggle(
    "active",
    pointSettingMode === "pen"
  );

  moveMarkerPointModeBtn.classList.toggle(
    "active",
    pointSettingMode === "moveMarker"
  );

  movePenPointModeBtn.classList.toggle(
    "active",
    pointSettingMode === "movePen"
  );
}
function updateConnectionUI() {
  connectionModeBtn.classList.toggle(
    "active",
    connectionMode
  );

  connectionModeBtn.textContent = connectionMode
    ? "連結モード：ON"
    : "連結モード：OFF";

  connectionStatus.textContent = connectionMode
    ? "1本目の棒の未使用の穴を選択してください。"
    : "連結モードをOFFにしました。";
}
function toggleFixedPointRemovalMode() {
  fixedPointRemovalMode = !fixedPointRemovalMode;

  // ほかの操作モードを解除
  connectionMode = false;
  pendingHole = null;
  pointSettingMode = null;

  updateConnectionUI();
  updatePointModeButtons();

  removeFixedPointModeBtn.classList.toggle(
    "active",
    fixedPointRemovalMode
  );

  removeFixedPointModeBtn.textContent =
    fixedPointRemovalMode
      ? "固定点解除モード：ON"
      : "固定点解除モード：OFF";

  pointSettingStatus.textContent =
    fixedPointRemovalMode
      ? "解除したい固定点をクリックしてください。"
      : "固定点解除モードをOFFにしました。";

  renderRods();
}
function setPointSettingMode(mode) {
  if (connectionMode) {
    connectionMode = false;
    pendingHole = null;
    updateConnectionUI();
  }

  // ほかの操作モードを解除
  connectionRemovalMode = false;
  fixedPointRemovalMode = false;

  removeConnectionModeBtn.classList.remove("active");
  removeConnectionModeBtn.textContent = "連結解除モード";

  removeFixedPointModeBtn.classList.remove("active");
  removeFixedPointModeBtn.textContent = "固定点解除モード";

  // 移動対象をリセット
  selectedPointForMove = null;

  pointSettingMode = mode;
  updatePointModeButtons();

  const messages = {
    fixed: "固定点の設定モードです。棒の端点または内分点をクリックしてください。",
    marker: "なぞる点の設定モードです。棒の端点または内分点をクリックしてください。",
    pen: "ペンの位置の設定モードです。棒の端点または内分点をクリックしてください。",
    moveMarker: "移動したいなぞる点をクリックしてください。",
    movePen: "移動したいペン先をクリックしてください。"
  };

  pointSettingStatus.textContent =
    mode === null
      ? "点の設定モードはOFFです。"
      : messages[mode];

  renderRods();
}


function cancelPointSettingMode() {
  setPointSettingMode(null);
}


/* =========================================
   穴の選択・連結
========================================= */

function selectHole(rodId, holeIndex) {
  if (!connectionMode) return;

  const rod = getRodById(rodId);
  if (!rod) return;

  if (pendingHole === null) {
    pendingHole = { rodId, holeIndex };

    connectionStatus.textContent =
      `棒${rodId}の穴${holeIndex + 1}を選択しました。次の棒の穴を選択してください。`;

    renderRods();
    return;
  }

  if (
    pendingHole.rodId === rodId &&
    pendingHole.holeIndex === holeIndex
  ) {
    pendingHole = null;
    connectionStatus.textContent = "選択を解除しました。";
    renderRods();
    return;
  }

  if (pendingHole.rodId === rodId) {
    connectionStatus.textContent = "別の棒を選択してください。";
    return;
  }

  const rodA = getRodById(pendingHole.rodId);
  const rodB = getRodById(rodId);

  if (!rodA || !rodB) return;

  const originalPositions = rods.map(rod => ({
    rod,
    x: rod.x,
    y: rod.y,
    angle: rod.angle
  }));

  const newConnection = {
    id: connections.length + 1,
    rodA: rodA.id,
    holeA: pendingHole.holeIndex,
    rodB: rodB.id,
    holeB: holeIndex
  };

  const candidateConnections = [
    ...connections,
    newConnection
  ];

  const result = solveMechanism(
    candidateConnections,
    rodA.id
  );

  if (!result.success) {
    originalPositions.forEach(position => {
      position.rod.x = position.x;
      position.rod.y = position.y;
      position.rod.angle = position.angle;
    });

    connectionStatus.textContent =
      `連結できませんでした。幾何的条件または固定点の条件を満たせません。誤差：${Number(result.error).toFixed(5)}`;

    pendingHole = null;
    renderRods();
    return;
  }

  connections.push(newConnection);
  pendingHole = null;

  connectionStatus.textContent =
    `棒${rodA.id}と棒${rodB.id}を連結しました。`;

  renderRods();
}


/* =========================================
   連結線の描画
========================================= */


function renderConnections() {
  connectionLayer.innerHTML = "";

  connections.forEach((connection, index) => {
    const rodA = getRodById(connection.rodA);
    const rodB = getRodById(connection.rodB);

    if (!rodA || !rodB) return;

    const pointA = getHolePosition(rodA, connection.holeA);
    const pointB = getHolePosition(rodB, connection.holeB);

    // 連結線を描画
    const line = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "line"
    );

    line.setAttribute("x1", pointA.x);
    line.setAttribute("y1", pointA.y);
    line.setAttribute("x2", pointB.x);
    line.setAttribute("y2", pointB.y);
    line.setAttribute("stroke", "#f5a623");
    line.setAttribute("stroke-width", "2");
    line.setAttribute("class", "connection-line");

    connectionLayer.appendChild(line);

    // 連結解除モードのときだけ、連結点に判定領域を設置
    if (connectionRemovalMode) {
      const hitArea = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
      );

      // 2つの接続位置の中点を連結点とする
      hitArea.setAttribute(
        "cx",
        (pointA.x + pointB.x) / 2
      );

      hitArea.setAttribute(
        "cy",
        (pointA.y + pointB.y) / 2
      );

      hitArea.setAttribute("r", "12");
      hitArea.setAttribute("fill", "transparent");
      hitArea.style.pointerEvents = "all";
      hitArea.style.cursor = "pointer";

      hitArea.addEventListener("click", event => {
        event.stopPropagation();

        // 選択した連結だけを解除
        connections.splice(index, 1);

        connectionRemovalMode = false;

        removeConnectionModeBtn.classList.remove("active");
        removeConnectionModeBtn.textContent = "連結解除モード";

        removeConnectionStatus.textContent =
          "選択した連結点を解除しました。";

        renderRods();
      });

      connectionLayer.appendChild(hitArea);
    }
  });
}


function deleteSelectedRod() {
  if (selectedRodId === null) {
    deleteRodStatus.textContent =
      "削除する棒を先にクリックしてください。";
    return;
  }

  const rodId = selectedRodId;

  // 連結されている棒は削除できない
  if (isRodConnected(rodId)) {
    deleteRodStatus.textContent =
      `棒${rodId}は連結されているため削除できません。`;
    return;
  }

  // 削除する棒に設定されている点を取得
  const removedPointIds = points
    .filter(point => point.rodId === rodId)
    .map(point => point.id);

  // 棒に設定された点を削除
  points = points.filter(point => point.rodId !== rodId);

  // 削除した点に関係する軌跡を削除
  tracePoints = tracePoints.filter(
    trace => !removedPointIds.includes(trace.pointId)
  );

  // 棒を削除
  rods = rods.filter(rod => rod.id !== rodId);

  // 念のため、該当する連結情報も削除
  connections = connections.filter(
    connection =>
      connection.rodA !== rodId &&
      connection.rodB !== rodId
  );

  selectedRodId = null;

  renderRods();

  deleteRodStatus.textContent =
    `棒${rodId}を削除しました。`;
}
/* =========================================
   棒の描画
========================================= */

function renderRods() {
  // 描画のたびにペン位置を記録
  recordPenTraces();
  renderTrace();

  rodLayer.innerHTML = "";

  rods.forEach(rod => {
    const group = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g"
    );

    group.setAttribute(
      "transform",
      `translate(${rod.x}, ${rod.y}) rotate(${rod.angle})`
    );

    group.dataset.rodId = rod.id;

    // 棒本体
    const body = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "line"
    );

    body.setAttribute("x1", 0);
    body.setAttribute("y1", 0);
    body.setAttribute("x2", rod.length);
    body.setAttribute("y2", 0);
    body.setAttribute("class", "rod-body");
// 選択中の棒を強調表示
if (selectedRodId === rod.id) {
  body.style.stroke = "#2196f3";
  body.style.strokeWidth = "10";
}
if (!connectionMode && pointSettingMode === null) {
  body.style.cursor = "move";

  body.addEventListener("click", event => {
    event.stopPropagation();

    selectedRodId = rod.id;

    const connected = isRodConnected(rod.id);

    deleteRodStatus.textContent = connected
      ? `棒${rod.id}は連結されているため削除できません。`
      : `棒${rod.id}を選択しました。削除できます。`;

    renderRods();
  });

  body.addEventListener("pointerdown", event => {
    startTranslation(event, rod);
  });
}   

else {
      body.style.cursor = "default";
    }

    group.appendChild(body);


    // 穴
    const holeCount = rod.divisionCount + 2;

    for (let i = 0; i < holeCount; i++) {
      const ratio = i / (holeCount - 1);
      const holeX = rod.length * ratio;

      const hole = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
      );

      hole.setAttribute("cx", holeX);
      hole.setAttribute("cy", 0);
      hole.setAttribute("r", 7);
      hole.setAttribute("class", "rod-hole");

      const connected = isHoleConnected(rod.id, i);

      if (
        pendingHole &&
        pendingHole.rodId === rod.id &&
        pendingHole.holeIndex === i
      ) {
        hole.setAttribute("fill", "#ffb74d");
        hole.setAttribute("r", 10);
      } else if (connected) {
        hole.setAttribute("fill", "#f5a623");
      }

      hole.addEventListener("click", event => {
        event.stopPropagation();

        if (connectionMode) {
          selectHole(rod.id, i);
        } else if (pointSettingMode !== null) {
          addPointToHole(rod.id, i);
        }
      });

      if (pointSettingMode !== null && !connectionMode) {
        hole.style.cursor = "pointer";
      }


      // 端点の操作
      if (
        (i === 0 || i === holeCount - 1) &&
        !connectionMode &&
        pointSettingMode === null
      ) {
        hole.style.cursor = "crosshair";

        hole.addEventListener("pointerdown", event => {
          if (isRodConnected(rod.id)) {
            startConnectedRotation(event, rod, i);
          } else {
            startRotation(event, rod, i);
          }
        });
      }

      group.appendChild(hole);
    }

    rodLayer.appendChild(group);
  });

  renderConnections();
  renderPoints();
}


/* =========================================
   棒の平行移動
========================================= */

function startTranslation(event, rod) {
  event.preventDefault();
  event.stopPropagation();

  const connectedIds = getConnectedRodIds(rod.id);

  // 固定点が含まれる機構は平行移動できない
  const hasFixedPoint = points.some(point =>
    point.type === "fixed" &&
    connectedIds.includes(point.rodId)
  );

  if (hasFixedPoint) {
    pointSettingStatus.textContent =
      "この機構には固定点があるため、全体を平行移動できません。端点を操作してください。";
    return;
  }

  const point = getSVGPoint(event);

  const originalPositions = connectedIds.map(id => {
    const targetRod = getRodById(id);

    return {
      rod: targetRod,
      x: targetRod.x,
      y: targetRod.y,
      angle: targetRod.angle
    };
  });

  dragState = {
    type: "translate",
    rod,
    startX: point.x,
    startY: point.y,
    originalPositions
  };
}


/* =========================================
   未連結棒の回転
========================================= */

function startRotation(event, rod, holeIndex) {
  event.preventDefault();
  event.stopPropagation();

  const fixedPoints = getFixedPointsForRod(rod.id);

  // 固定点が複数ある場合、棒の回転はできない
  if (fixedPoints.length > 1) {
    pointSettingStatus.textContent =
      "この棒には複数の固定点があるため、回転できません。";
    return;
  }

  const angle = rod.angle * Math.PI / 180;

  let pivotX;
  let pivotY;
  let pivotLocalX;

  if (fixedPoints.length === 1) {
    // 固定点を回転中心にする
    const fixedPoint = fixedPoints[0];
    const position = getHolePosition(rod, fixedPoint.holeIndex);

    pivotX = position.x;
    pivotY = position.y;

    const holeCount = rod.divisionCount + 2;
    pivotLocalX =
      rod.length * fixedPoint.holeIndex / (holeCount - 1);

  } else {
    // 通常はドラッグしている端点の反対側を中心にする
    const isLeftEnd = holeIndex === 0;

    pivotLocalX = isLeftEnd ? rod.length : 0;

    pivotX = rod.x + pivotLocalX * Math.cos(angle);
    pivotY = rod.y + pivotLocalX * Math.sin(angle);
  }

  dragState = {
    type: "rotate",
    rod,
    pivotX,
    pivotY,
    pivotLocalX
  };
}


/* =========================================
   連結機構の端点操作
========================================= */

function startConnectedRotation(event, rod, endpointIndex) {
  event.preventDefault();
  event.stopPropagation();

  const connectedIds = getConnectedRodIds(rod.id);

  const originalPositions = connectedIds.map(id => {
    const targetRod = getRodById(id);

    return {
      rod: targetRod,
      x: targetRod.x,
      y: targetRod.y,
      angle: targetRod.angle
    };
  });

  dragState = {
    type: "connectedEndpoint",
    rod,
    holeIndex: endpointIndex,
    originalPositions,
    lastValidPositions: originalPositions.map(position => ({
      rod: position.rod,
      x: position.x,
      y: position.y,
      angle: position.angle
    }))
  };
}


/* =========================================
   なぞる点のドラッグ開始
========================================= */

function startMarkerDrag(event, markerPoint) {
  event.preventDefault();
  event.stopPropagation();

  const rod = getRodById(markerPoint.rodId);
  if (!rod) return;

  const connectedIds = getConnectedRodIds(rod.id);

  // 同じ機構内にある固定点を確認
  const hasFixedPoint = points.some(point =>
    point.type === "fixed" &&
    connectedIds.includes(point.rodId)
  );

  // 現在の配置を保存
  const originalPositions = connectedIds.map(id => {
    const targetRod = getRodById(id);

    return {
      rod: targetRod,
      x: targetRod.x,
      y: targetRod.y,
      angle: targetRod.angle
    };
  });

  const position = getHolePosition(
    rod,
    markerPoint.holeIndex
  );

  dragState = {
    type: "markerPoint",

    rod,

    markerPoint,

    targetStartX: position.x,
    targetStartY: position.y,

    pointerStart: getSVGPoint(event),

    originalPositions,

    lastValidPositions: originalPositions.map(item => ({
      rod: item.rod,
      x: item.x,
      y: item.y,
      angle: item.angle
    }))
  };
}

/* =========================================
   ドラッグ処理
========================================= */

function onPointerMove(event) {
  if (!dragState) return;

  const point = getSVGPoint(event);


  // 1. 機構全体の平行移動
  if (dragState.type === "translate") {
    const dx = point.x - dragState.startX;
    const dy = point.y - dragState.startY;

    dragState.originalPositions.forEach(position => {
      position.rod.x = position.x + dx;
      position.rod.y = position.y + dy;
    });
  }


  // 2. 未連結棒の回転
  if (dragState.type === "rotate") {
    const rod = dragState.rod;

    const dx = point.x - dragState.pivotX;
    const dy = point.y - dragState.pivotY;

    const angle = Math.atan2(dy, dx);

    rod.angle = angle * 180 / Math.PI;

    rod.x =
      dragState.pivotX -
      dragState.pivotLocalX * Math.cos(angle);

    rod.y =
      dragState.pivotY -
      dragState.pivotLocalX * Math.sin(angle);
  }


  // 3. 連結機構の端点操作
  if (dragState.type === "connectedEndpoint") {
    const targetPoint = {
      rodId: dragState.rod.id,
      holeIndex: dragState.holeIndex,
      x: point.x,
      y: point.y
    };

    const result = solveMechanism(
      connections,
      null,
      {
        targetPoint,
        referencePositions: dragState.lastValidPositions,

        constraintWeight: 1000,
        fixedPointWeight: 10000,
        targetWeight: 1,
        poseWeight: 0.0001,

        targetTolerance: 2,
        fixedPointTolerance: 0.05,
        tolerance: 1e-4,
        maxIterations: 100
      }
    );

    if (result.success) {
      dragState.lastValidPositions =
        dragState.originalPositions.map(position => ({
          rod: position.rod,
          x: position.rod.x,
          y: position.rod.y,
          angle: position.rod.angle
        }));

      connectionStatus.textContent =
        `端点を移動しています。目標位置との誤差：${result.targetError.toFixed(2)}`;

    } else {
      dragState.lastValidPositions.forEach(position => {
        position.rod.x = position.x;
        position.rod.y = position.y;
        position.rod.angle = position.angle;
      });

      connectionStatus.textContent =
        "この位置には移動できません。固定点や連結条件を確認してください。";
    }
  }


  // 4. なぞる点の操作
  if (dragState.type === "markerPoint") {
    const dx = point.x - dragState.pointerStart.x;
    const dy = point.y - dragState.pointerStart.y;

    const targetPoint = {
      rodId: dragState.markerPoint.rodId,
      holeIndex: dragState.markerPoint.holeIndex,
      x: dragState.targetStartX + dx,
      y: dragState.targetStartY + dy
    };

    const result = solveMechanism(
      connections,
      null,
      {
        targetPoint,

        referencePositions:
          dragState.lastValidPositions,

        constraintWeight: 1000,
        fixedPointWeight: 10000,
        targetWeight: 1,
        poseWeight: 0.0001,

        targetTolerance: 2,
        fixedPointTolerance: 0.05,
        tolerance: 1e-4,
        maxIterations: 100
      }
    );

    if (result.success) {
      dragState.lastValidPositions =
        dragState.originalPositions.map(position => ({
          rod: position.rod,
          x: position.rod.x,
          y: position.rod.y,
          angle: position.rod.angle
        }));

      connectionStatus.textContent =
        `なぞる点を移動しています。誤差：${result.targetError.toFixed(2)}`;

    } else {
      dragState.lastValidPositions.forEach(position => {
        position.rod.x = position.x;
        position.rod.y = position.y;
        position.rod.angle = position.angle;
      });

      connectionStatus.textContent =
        "この位置には移動できません。";
    }
  }

  renderRods();
}


/* =========================================
   ドラッグ終了
========================================= */

function onPointerUp() {
  dragState = null;
}

/* =========================================
   モード切り替え
========================================= */

function switchMode(mode) {
  currentMode = mode;

  // 描画中の操作を終了
  stopDrawing();
  dragState = null;

  if (mode === "drawing") {
    // 描画モード
    assemblyControls.hidden = true;
    drawingControls.hidden = false;

    assemblyModeBtn.classList.remove("active");
    drawingModeBtn.classList.add("active");

    // 組み立て操作を無効化
    rodLayer.style.pointerEvents = "none";
    connectionLayer.style.pointerEvents = "none";
    pointLayer.style.pointerEvents = "none";

    // 接続モード・点の設定モードを解除
    connectionMode = false;
    pendingHole = null;
    pointSettingMode = null;

    updateConnectionUI();
    updatePointModeButtons();

    drawingStatus.textContent =
      "マウスを押したまま動かして図形を描いてください。";

  } else {
    // 組み立てモード
    assemblyControls.hidden = false;
    drawingControls.hidden = true;

    assemblyModeBtn.classList.add("active");
    drawingModeBtn.classList.remove("active");

    // 組み立て操作を有効化
    rodLayer.style.pointerEvents = "auto";
    connectionLayer.style.pointerEvents = "auto";
    pointLayer.style.pointerEvents = "auto";
  }
}
/* =========================================
   自由描画機能
========================================= */

// 描画開始
function startDrawing(event) {
  if (currentMode !== "drawing") return;

  event.preventDefault();

  const point = getSVGPoint(event);

  currentStroke = [point];
  figureStrokes.push(currentStroke);

  isDrawing = true;

  const polyline = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polyline"
  );

  polyline.setAttribute("fill", "none");
  polyline.setAttribute("stroke", "#111");
  polyline.setAttribute("stroke-width", "3");
  polyline.setAttribute("stroke-linecap", "round");
  polyline.setAttribute("stroke-linejoin", "round");
  polyline.setAttribute("points", `${point.x},${point.y}`);

  figureLayer.appendChild(polyline);

  currentStroke.element = polyline;
}

// 描画中
function continueDrawing(event) {
  if (!isDrawing || !currentStroke) return;

  const point = getSVGPoint(event);

  currentStroke.push(point);

  currentStroke.element.setAttribute(
    "points",
    currentStroke
      .map(p => `${p.x},${p.y}`)
      .join(" ")
  );
}

// 描画終了
function stopDrawing() {
  isDrawing = false;
  currentStroke = null;
}

// 描いた図形をすべて消去
// 直前に描いた線を取り消す
function undoDrawing() {
  if (figureStrokes.length === 0) {
    drawingStatus.textContent =
      "取り消せる図形はありません。";
    return;
  }

  const lastStroke = figureStrokes.pop();

  if (lastStroke.element) {
    lastStroke.element.remove();
  }

  drawingStatus.textContent =
    "直前に描いた線を取り消しました。";
}
function clearFigure() {
  figureStrokes = [];
  figureLayer.innerHTML = "";

  if (drawingStatus) {
    drawingStatus.textContent = "描いた図形を消去しました。";
  }
}

/* =========================================
   イベント設定
========================================= */

addRodBtn.addEventListener("click", addRod);
deleteRodBtn.addEventListener("click", deleteSelectedRod);
connectionModeBtn.addEventListener(
  "click",
  toggleConnectionMode
);
removeConnectionModeBtn.addEventListener(
  "click",
  toggleConnectionRemovalMode
);
fixedPointModeBtn.addEventListener(
  "click",
  () => setPointSettingMode("fixed")
);
removeFixedPointModeBtn.addEventListener(
  "click",
  toggleFixedPointRemovalMode
);
markerPointModeBtn.addEventListener(
  "click",
  () => setPointSettingMode("marker")
);
moveMarkerPointModeBtn.addEventListener(
  "click",
  () => setPointSettingMode("moveMarker")
);

movePenPointModeBtn.addEventListener(
  "click",
  () => setPointSettingMode("movePen")
);
penPointModeBtn.addEventListener(
  "click",
  () => setPointSettingMode("pen")
);
penToggleBtn.addEventListener("click", togglePen);
cancelPointModeBtn.addEventListener(
  "click",
  cancelPointSettingMode
);

if (clearTraceBtn) {
  clearTraceBtn.addEventListener("click", clearTraces);
}

document.addEventListener("pointermove", onPointerMove);
document.addEventListener("pointerup", onPointerUp);
document.addEventListener("pointercancel", onPointerUp);

// 自由描画イベント
drawingArea.addEventListener("pointerdown", startDrawing);
document.addEventListener("pointermove", continueDrawing);
document.addEventListener("pointerup", stopDrawing);
document.addEventListener("pointercancel", stopDrawing);

// 描いた図形を消去
clearFigureBtn.addEventListener("click", clearFigure);
undoDrawingBtn.addEventListener(
  "click",
  undoDrawing
);
// モード切り替え
assemblyModeBtn.addEventListener("click", () => {
  switchMode("assembly");
});

drawingModeBtn.addEventListener("click", () => {
  switchMode("drawing");
});
/* =========================================
   初期化
========================================= */

renderRods();
