/*
 *  Copyright 1998-2025 by Northwoods Software Corporation. All Rights Reserved.
 */
/*
 * This is an extension and not part of the main GoJS library.
 * The source code for this is at extensionsJSM/SwimLaneLayout.ts.
 * Note that the API for this class may change with any version, even point releases.
 * If you intend to use an extension in production, you should copy the code to your own source directory.
 * Extensions can be found in the GoJS kit under the extensions or extensionsJSM folders.
 * See the Extensions intro page (https://gojs.net/latest/intro/extensions.html) for more information.
 */

/**
 * A custom LayeredDigraphLayout that knows about "lanes"
 * and that positions each node in its respective lane.

 * This assumes that each Node.data.lane property is a string that names the lane the node should be in.
 * You can set the {@link laneProperty} property to use a different data property name.
 * It is commonplace to set this property to be the same as the {@link go.GraphLinksModel.nodeGroupKeyProperty},
 * so that the one property indicates that a particular node data is a member of a particular group
 * and thus that that group represents a lane.

 * The lanes can be sorted by specifying the {@link laneComparer} function.

 * You can add extra space between the lanes by increasing {@link laneSpacing} from its default of zero.
 * That number's unit is columns, {@link go.LayeredDigraphLayout.columnSpacing}, not in document coordinates.
 *
 * If you want to experiment with this extension, try the <a href="../../samples/SwimLaneLayout.html">SwimLaneLayout</a> sample.
 * @category Layout Extension
 */
class SwimLaneLayout extends go.LayeredDigraphLayout {
    constructor(init) {
        super();
        this._laneProperty = 'lane'; // how to get lane identifier string from node data
        this._laneNames = []; // lane names, may be sorted using this.laneComparer
        this._laneIndexes = new go.Map();
        this._laneComparer = null;
        this._laneSpacing = 0; // in columns
        this._router = { linkSpacing: 4 };
        this._reducer = null;
        // computed, read-only state
        this._lanePositions = new go.Map(); // lane names --> start columns, left to right
        this._laneBreadths = new go.Map(); // lane names --> needed width in columns
        // internal state
        this._layers = [[]];
        this._neededSpaces = [];
        if (init)
            Object.assign(this, init);
    }
    /**
     * Gets or sets the name of the data property that holds the string which is the name of the lane that the node should be in.
     * The default value is "lane".
     */
    get laneProperty() {
        return this._laneProperty;
    }
    set laneProperty(val) {
        if (typeof val !== 'string' && typeof val !== 'function')
            throw new Error('new value for SwimLaneLayout.laneProperty must be a property name, not: ' + val);
        if (this._laneProperty !== val) {
            this._laneProperty = val;
            this.invalidateLayout();
        }
    }
    /**
     * Gets or sets an Array of lane names.
     * If you set this before a layout happens, it will use those lanes in that order.
     * Any additional lane names that it discovers will be added to the end of this Array.
     *
     * This property is reset to an empty Array at the end of each layout.
     * The default value is an empty Array.
     */
    get laneNames() {
        return this._laneNames;
    }
    set laneNames(val) {
        if (!Array.isArray(val))
            throw new Error('new value for SwimLaneLayout.laneNames must be an Array, not: ' + val);
        if (this._laneNames !== val) {
            this._laneNames = val;
            this.invalidateLayout();
        }
    }
    /**
     * Gets or sets a function by which to compare lane names, for ordering the lanes within the {@link laneNames} Array.
     * By default the function is null -- the lanes are not sorted.
     */
    get laneComparer() {
        return this._laneComparer;
    }
    set laneComparer(val) {
        if (typeof val !== 'function')
            throw new Error('new value for SwimLaneLayout.laneComparer must be a function, not: ' + val);
        if (this._laneComparer !== val) {
            this._laneComparer = val;
            this.invalidateLayout();
        }
    }
    /**
     * Gets or sets the amount of additional space it allocates between the lanes.
     * This number specifies the number of columns, with the same meaning as {@link go.LayeredDigraphLayout.columnSpacing}.
     * The number unit is not in document coordinate or pixels.
     * The default value is zero columns.
     */
    get laneSpacing() {
        return this._laneSpacing;
    }
    set laneSpacing(val) {
        if (typeof val !== 'number')
            throw new Error('new value for SwimLaneLayout.laneSpacing must be a number, not: ' + val);
        if (this._laneSpacing !== val) {
            this._laneSpacing = val;
            this.invalidateLayout();
        }
    }
    /**
     * @hidden
     */
    get router() {
        return this._router;
    }
    set router(val) {
        if (this._router !== val) {
            this._router = val;
            this.invalidateLayout();
        }
    }
    /**
     * @hidden
     */
    get reducer() {
        return this._reducer;
    }
    set reducer(val) {
        if (this._reducer !== val) {
            this._reducer = val;
            if (val) {
                const lay = this;
                val.findLane = (v) => lay.getLane(v);
                val.getIndex = (v) => v.index;
                val.getBary = (v) => v.bary || 0;
                val.setBary = (v, value) => (v.bary = value);
                val.getConnectedNodesIterator = (v) => v.vertexes;
            }
            this.invalidateLayout();
        }
    }
    /**
     * The computed positions of each lane,
     * in the form of a {@link go.Map} mapping lane names (strings) to numbers.
     */
    get lanePositions() {
        return this._lanePositions;
    }
    /**
     * The computed breadths (widths or heights depending on the direction) of each lane,
     * in the form of a {@link go.Map} mapping lane names (strings) to numbers.
     */
    get laneBreadths() {
        return this._laneBreadths;
    }
    /**
     * @hidden
     * @param coll
     */
    doLayout(coll) {
        this.lanePositions.clear(); // lane names --> start columns, left to right
        this.laneBreadths.clear(); // lane names --> needed width in columns
        this._layers = [[]];
        this._neededSpaces = [];
        super.doLayout(coll);
        this.lanePositions.clear();
        this.laneBreadths.clear();
        this._layers = [[]];
        this._neededSpaces = [];
    }
    /**
     * @hidden
     * @param v
     * @param topleft
     */
    nodeMinLayerSpace(v, topleft) {
        if (!this._neededSpaces)
            this._neededSpaces = this.computeNeededLayerSpaces(this.network);
        if (v.node === null)
            return 0;
        let lay = v.layer;
        if (!topleft) {
            if (lay > 0)
                lay--;
        }
        const overlaps = (this._neededSpaces[lay] || 0) / 2;
        const edges = this.countEdgesForDirection(v, this.direction > 135 ? !topleft : topleft);
        const needed = Math.max(overlaps, edges) * this.router.linkSpacing * 1.5;
        if (this.direction === 90 || this.direction === 270) {
            if (topleft) {
                return v.focus.y + 10 + needed;
            }
            else {
                return v.bounds.height - v.focus.y + 10 + needed;
            }
        }
        else {
            if (topleft) {
                return v.focus.x + 10 + needed;
            }
            else {
                return v.bounds.width - v.focus.x + 10 + needed;
            }
        }
    }
    countEdgesForDirection(vertex, topleft) {
        let c = 0;
        const lay = vertex.layer;
        vertex.edges.each((e) => {
            if (topleft) {
                if (e.getOtherVertex(vertex).layer >= lay)
                    c++;
            }
            else {
                if (e.getOtherVertex(vertex).layer <= lay)
                    c++;
            }
        });
        return c;
    }
    computeNeededLayerSpaces(net) {
        // group all edges by their connected vertexes' least layer
        const layerMinEdges = [];
        net.edges.each((e) => {
            // consider all edges, including dummy ones!
            const f = e.fromVertex;
            const t = e.toVertex;
            if (f.column === t.column)
                return; // skip edges that don't go between columns
            if (Math.abs(f.layer - t.layer) > 1)
                return; // skip edges that don't go between adjacent layers
            const lay = Math.min(f.layer, t.layer);
            let arr = layerMinEdges[lay];
            if (!arr)
                arr = layerMinEdges[lay] = [];
            arr.push(e);
        });
        // sort each array of edges by their lowest connected vertex column
        // for edges with the same minimum column, sort by their maximum column
        const layerMaxEdges = []; // same as layerMinEdges, but sorted by maximum column
        layerMinEdges.forEach((arr, lay) => {
            if (!arr)
                return;
            arr.sort((e1, e2) => {
                const f1c = e1.fromVertex.column;
                const t1c = e1.toVertex.column;
                const f2c = e2.fromVertex.column;
                const t2c = e2.toVertex.column;
                const e1mincol = Math.min(f1c, t1c);
                const e2mincol = Math.min(f2c, t2c);
                if (e1mincol > e2mincol)
                    return 1;
                if (e1mincol < e2mincol)
                    return -1;
                const e1maxcol = Math.max(f1c, t1c);
                const e2maxcol = Math.max(f2c, t2c);
                if (e1maxcol > e2maxcol)
                    return 1;
                if (e1maxcol < e2maxcol)
                    return -1;
                return 0;
            });
            layerMaxEdges[lay] = arr.slice(0);
            layerMaxEdges[lay].sort((e1, e2) => {
                const f1c = e1.fromVertex.column;
                const t1c = e1.toVertex.column;
                const f2c = e2.fromVertex.column;
                const t2c = e2.toVertex.column;
                const e1maxcol = Math.max(f1c, t1c);
                const e2maxcol = Math.max(f2c, t2c);
                if (e1maxcol > e2maxcol)
                    return 1;
                if (e1maxcol < e2maxcol)
                    return -1;
                const e1mincol = Math.min(f1c, t1c);
                const e2mincol = Math.min(f2c, t2c);
                if (e1mincol > e2mincol)
                    return 1;
                if (e1mincol < e2mincol)
                    return -1;
                return 0;
            });
        });
        // run through each array of edges to count how many overlaps there might be
        const layerOverlaps = [];
        layerMinEdges.forEach((arr, lay) => {
            const mins = arr; // sorted by min column
            const maxs = layerMaxEdges[lay]; // sorted by max column
            let maxoverlap = 0; // maximum count for this layer
            if (mins && maxs && mins.length > 1 && maxs.length > 1) {
                let mini = 0;
                let min = null;
                let maxi = 0;
                let max = null;
                while (mini < mins.length || maxi < maxs.length) {
                    if (mini < mins.length)
                        min = mins[mini];
                    const mincol = min
                        ? Math.min(min.fromVertex.column, min.toVertex.column)
                        : 0;
                    if (maxi < maxs.length)
                        max = maxs[maxi];
                    const maxcol = max
                        ? Math.max(max.fromVertex.column, max.toVertex.column)
                        : Infinity;
                    maxoverlap = Math.max(maxoverlap, Math.abs(mini - maxi));
                    if (mincol <= maxcol && mini < mins.length) {
                        mini++;
                    }
                    else if (maxi < maxs.length) {
                        maxi++;
                    }
                }
            }
            layerOverlaps[lay] = maxoverlap * 1.5; // # of parallel links
        });
        return layerOverlaps;
    }
    setupLanes() {
        // set up some data structures
        const layout = this;
        const laneNameSet = new go.Set().addAll(this.laneNames);
        const laneIndexes = new go.Map(); // lane name --> index when sorted
        const vit = this.network.vertexes.iterator;
        while (vit.next()) {
            const v = vit.value;
            // discover any more lane names
            const lane = this.getLane(v); // cannot call findLane yet
            if (lane !== null && !laneNameSet.has(lane)) {
                laneNameSet.add(lane);
                this.laneNames.push(lane);
            }
            const layer = v.layer;
            if (layer >= 0) {
                const arr = this._layers[layer];
                if (!arr) {
                    this._layers[layer] = [v];
                }
                else {
                    arr.push(v);
                }
            }
        }
        // sort laneNames and initialize laneIndexes with sorted indexes
        if (typeof this.laneComparer === 'function')
            this.laneNames.sort(this.laneComparer);
        for (let i = 0; i < this.laneNames.length; i++) {
            laneIndexes.set(this.laneNames[i], i);
        }
        this._laneIndexes = laneIndexes;
        // now OK to call findLane
        // sort vertexes so that vertexes are grouped by lane
        for (let i = 0; i <= this.maxLayer; i++) {
            this._layers[i].sort((a, b) => layout.compareVertexes(a, b));
        }
    }
    /**
     * @hidden
     * Replace the standard reduceCrossings behavior so that it respects lanes.
     */
    reduceCrossings() {
        this.setupLanes();
        // this just cares about the .index and ignores .column
        const layers = this._layers;
        const red = this.reducer;
        if (red) {
            red.laneIndexes = this._laneIndexes;
            for (let i = 1; i < layers.length; i++) {
                red.reduceCrossings(layers[i], layers[i - 1]);
                layers[i].forEach((v, j) => (v.index = j));
            }
            for (let i = layers.length - 2; i >= 0; i--) {
                red.reduceCrossings(layers[i], layers[i + 1]);
                layers[i].forEach((v, j) => (v.index = j));
            }
        }
        this.computeLanes(); // and recompute all vertex.column values
    }
    computeLanes() {
        // compute needed width for each lane, in columns
        for (let i = 0; i < this.laneNames.length; i++) {
            const lane = this.laneNames[i];
            this.laneBreadths.set(lane, this.computeMinLaneWidth(lane));
        }
        const lwidths = new go.Map(); // reused for each layer
        for (let i = 0; i <= this.maxLayer; i++) {
            const arr = this._layers[i];
            if (arr) {
                const layout = this;
                // now run through Array finding width (in columns) of each lane
                // and max with this.laneBreadths.get(lane)
                for (let j = 0; j < arr.length; j++) {
                    const v = arr[j];
                    const w = this.nodeMinColumnSpace(v, true) + 1 + this.nodeMinColumnSpace(v, false);
                    const ln = this.findLane(v) || '';
                    const totw = lwidths.get(ln);
                    if (totw === null) {
                        lwidths.set(ln, w);
                    }
                    else {
                        lwidths.set(ln, totw + w);
                    }
                }
                lwidths.each((kvp) => {
                    const lane = kvp.key;
                    const colsInLayer = kvp.value;
                    const colsMax = layout.laneBreadths.get(lane) || 0;
                    if (colsInLayer > colsMax)
                        layout.laneBreadths.set(lane, colsInLayer);
                });
                lwidths.clear();
            }
        }
        // compute starting positions for each lane
        let x = 0;
        for (let i = 0; i < this.laneNames.length; i++) {
            const lane = this.laneNames[i];
            this.lanePositions.set(lane, x);
            const w = this.laneBreadths.get(lane) || 0;
            x += w + this.laneSpacing;
        }
        this.renormalizeColumns();
    }
    renormalizeColumns() {
        // set new column and index on each vertex
        for (let i = 0; i < this._layers.length; i++) {
            let prevlane = null;
            let c = 0;
            const arr = this._layers[i];
            for (let j = 0; j < arr.length; j++) {
                const v = arr[j];
                v.index = j;
                const l = this.findLane(v);
                if (l && prevlane !== l) {
                    c = this.lanePositions.get(l) || 0;
                    const w = this.laneBreadths.get(l) || 0;
                    // compute needed breadth within lane, in columns
                    let z = this.nodeMinColumnSpace(v, true) + 1 + this.nodeMinColumnSpace(v, false);
                    let k = j + 1;
                    while (k < arr.length && this.findLane(arr[k]) === l) {
                        const vz = arr[k];
                        z += this.nodeMinColumnSpace(vz, true) + 1 + this.nodeMinColumnSpace(vz, false);
                        k++;
                    }
                    // if there is extra space, shift the vertexes to the middle of the lane
                    if (z < w) {
                        c += Math.floor((w - z) / 2);
                    }
                }
                c += this.nodeMinColumnSpace(v, true);
                v.column = c;
                c += 1;
                c += this.nodeMinColumnSpace(v, false);
                prevlane = l;
            }
        }
    }
    /**
     * Return the minimum lane width, in columns
     * @param lane
     */
    computeMinLaneWidth(lane) {
        return 0;
    }
    /**
     * @hidden
     * Disable normal straightenAndPack behavior, which would mess up the columns.
     */
    straightenAndPack() { }
    /**
     * Given a vertex, get the lane (name) that its node belongs in.
     * If the lane appears to be undefined, this returns the empty string.
     * For dummy vertexes (with no node) this will return null.
     * @param v
     */
    getLane(v) {
        if (v === null)
            return null;
        const node = v.node;
        if (node !== null) {
            const data = node.data;
            if (data !== null) {
                let lane = null;
                if (typeof this.laneProperty === 'function') {
                    lane = this.laneProperty(data);
                }
                else {
                    lane = data[this.laneProperty];
                }
                if (typeof lane === 'string')
                    return lane;
                return ''; // default lane
            }
        }
        return null;
    }
    /**
     * This is just like {@link getLane} but handles dummy vertexes
     * for which the {@link getLane} returns null by returning the
     * lane of the edge's source or destination vertex.
     * This can only be called after the lanes have been set up internally.
     * @param v
     */
    findLane(v) {
        if (v !== null) {
            const lane = this.getLane(v);
            if (lane !== null) {
                return lane;
            }
            else {
                const srcv = this.findRealSource(v.sourceEdges.first());
                const dstv = this.findRealDestination(v.destinationEdges.first());
                const srcLane = this.getLane(srcv);
                const dstLane = this.getLane(dstv);
                if (srcLane !== null || dstLane !== null) {
                    if (srcLane === dstLane)
                        return srcLane;
                    if (srcLane !== null)
                        return srcLane;
                    if (dstLane !== null)
                        return dstLane;
                }
            }
        }
        return null;
    }
    findRealSource(e) {
        if (e === null)
            return null;
        const fv = e.fromVertex;
        if (fv && fv.node)
            return fv;
        return this.findRealSource(fv.sourceEdges.first());
    }
    findRealDestination(e) {
        if (e === null)
            return null;
        const tv = e.toVertex;
        if (tv.node)
            return tv;
        return this.findRealDestination(tv.destinationEdges.first());
    }
    compareVertexes(v, w) {
        let laneV = this.findLane(v);
        if (laneV === null)
            laneV = '';
        let laneW = this.findLane(w);
        if (laneW === null)
            laneW = '';
        const idxV = this._laneIndexes.get(laneV) || 0;
        const idxW = this._laneIndexes.get(laneW) || 0;
        if (idxV < idxW)
            return -1;
        if (idxV > idxW)
            return 1;
        // OPTIONAL: sort dummy vertexes before vertexes representing real nodes
        if (v.node === null && w.node !== null)
            return -1;
        if (v.node !== null && w.node === null)
            return 1;
        if (v.column < w.column)
            return -1;
        if (v.column > w.column)
            return 1;
        return 0;
    }
}
