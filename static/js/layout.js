/*
 * layout.js — decides where every box of a roadmap sits on the map.
 *
 * It is a pure function (no page access) so it can be tested on its own.
 *
 * The rule:
 *   The road runs left to right along y = 0.
 *   gate -> checkpoint 1 -> [resources] -> checkpoint 2 -> [resources] -> ... -> keep
 *
 *   * 1 resource at a checkpoint  -> it sits on the road: a straight line.
 *   * 2+ resources                -> they stack in a column, centred on the road.
 *                                    The road forks into them and rejoins at the next
 *                                    checkpoint (or the keep).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RoadmapLayout = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SIZE = {
    GATE_W: 120, MARK_H: 64,
    CP_W: 280, CP_H: 96,
    RES_W: 300, RES_H: 124,
    GAP_X: 130, GAP_Y: 36,
  };

  function layout(checkpoints) {
    var nodes = [];
    var edges = []; // pairs of node ids: [fromId, toId]
    var byId = {};
    var nextId = 0;

    function add(node) {
      node.id = "n" + nextId++;
      nodes.push(node);
      byId[node.id] = node;
      return node;
    }

    var x = 0;
    var gate = add({ type: "gate", x: x, y: -SIZE.MARK_H / 2, w: SIZE.GATE_W, h: SIZE.MARK_H, payload: null });
    x += SIZE.GATE_W + SIZE.GAP_X;

    var previous = [gate]; // the boxes the next checkpoint must be joined to

    checkpoints.forEach(function (cp, index) {
      var cpNode = add({
        type: "checkpoint", number: index + 1,
        x: x, y: -SIZE.CP_H / 2, w: SIZE.CP_W, h: SIZE.CP_H,
        payload: cp, resourceIds: [],
      });
      previous.forEach(function (p) { edges.push([p.id, cpNode.id]); });
      x += SIZE.CP_W + SIZE.GAP_X;

      var resources = cp.resources || [];
      if (!resources.length) { previous = [cpNode]; return; }

      var n = resources.length;
      var step = SIZE.RES_H + SIZE.GAP_Y;
      var column = resources.map(function (r, k) {
        var centreY = (k - (n - 1) / 2) * step;
        var node = add({
          type: "resource", number: index + 1, branch: n > 1,
          x: x, y: centreY - SIZE.RES_H / 2, w: SIZE.RES_W, h: SIZE.RES_H,
          payload: r,
        });
        edges.push([cpNode.id, node.id]);
        cpNode.resourceIds.push(node.id);
        return node;
      });
      x += SIZE.RES_W + SIZE.GAP_X;
      previous = column;
    });

    var keep = add({ type: "keep", x: x, y: -SIZE.MARK_H / 2, w: SIZE.GATE_W, h: SIZE.MARK_H, payload: null });
    previous.forEach(function (p) { edges.push([p.id, keep.id]); });

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(function (n) {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h);
    });

    return {
      nodes: nodes, edges: edges, byId: byId,
      bounds: { minX: minX, minY: minY, maxX: maxX, maxY: maxY, w: maxX - minX, h: maxY - minY },
    };
  }

  return { layout: layout, SIZE: SIZE };
});
