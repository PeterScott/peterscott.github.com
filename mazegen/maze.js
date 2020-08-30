// This code is ugly hackware, and if you look at it you have only yourself to blame.

Direction = {UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3};

function flipDirection(dir) {
    return [Direction.DOWN, Direction.LEFT, Direction.UP, Direction.RIGHT][dir];
}

class Cell {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.walls = [true, true, true, true]; // up, right, down, left
        this.neighbors = [null, null, null, null]; // up, right, down, left
    }

    removeWall(dir) {
        // Need to remove walls from both cells.
        let neighbor = this.neighbors[dir];
        if (neighbor) {
            this.walls[dir] = false;
            neighbor.walls[flipDirection(dir)] = false;
        }
    }
}

class Wall {
    constructor(a, b) {
        this.a = a; this.b = b;
    }
    remove() {
        for (let dir = 0; dir < 4; dir++) {
            if (this.a.neighbors[dir] === this.b) {
                this.a.removeWall(dir);
                break;
            }
        }
    }
}

function makeGrid(nrows, ncols) {
    // Create cells
    let grid = [];
    for (let i = 0; i < nrows; i++) {
        let row = [];
        for (let j = 0; j < ncols; j++) {
            row.push(new Cell(i, j));
        }
        grid.push(row);
    }
    // Hook together neighboring cells
    for (let i = 0; i < nrows; i++) {
        for (let j = 0; j < ncols; j++) {
            if (i !== 0) {
                grid[i][j].neighbors[Direction.UP] = grid[i-1][j];
            } if (j !== ncols-1) {
                grid[i][j].neighbors[Direction.RIGHT] = grid[i][j+1];
            } if (i !== nrows-1) {
                grid[i][j].neighbors[Direction.DOWN] = grid[i+1][j];
            } if (j !== 0) {
                grid[i][j].neighbors[Direction.LEFT] = grid[i][j-1];
            }
        }
    }
    return grid;
}

function htmlForGrid(grid) {
    let html = '<table class="maze">\n';
    let nrows = grid.length, ncols = grid[0].length;
    for (let i = 0; i < nrows; i++) {
        html += '  <tr>\n';
        for (let j = 0; j < ncols; j++) {
            html += '    <td style="border-style:';
            for (let dir = 0; dir < 4; dir++) {
                html += [' none', ' solid'][0 + !!grid[i][j].walls[dir]];
            }
            html += '"></td>\n';
        }
        html += '  </tr>\n';
    }
    html += '</table>\n';
    return html;
}

function randint(max) {
    return Math.floor(Math.random() * max); // not inclusive
}

// From https://stackoverflow.com/questions/6274339/how-can-i-shuffle-an-array
function shuffle(a) {
    var j, x, i;
    for (i = a.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        x = a[i];
        a[i] = a[j];
        a[j] = x;
    }
    return a;
}

function innerWalls(grid) {
    let walls = [];
    let nrows = grid.length, ncols = grid[0].length;
    for (let i = 0; i < nrows; i++) {
        for (let j = 0; j < ncols; j++) {
            if (i < nrows-1) walls.push(new Wall(grid[i][j], grid[i+1][j]));
            if (j < ncols-1) walls.push(new Wall(grid[i][j], grid[i][j+1]));
        }
    }
    return walls;
}

function kruskal(nrows, ncols) {
    // Assign each square in the grid a set id, initially unique.
    let grid = makeGrid(nrows, ncols)
    let sets = {}; // map setid to cells
    for (let i = 0; i < nrows; i++) {
        for (let j = 0; j < ncols; j++) {
            grid[i][j].setid = i*ncols+j;
            sets[grid[i][j].setid] = [grid[i][j]];
        }
    }
    // Until there's only one set, loop over the walls in random order and break down each
    // wall between two different sets.
    let walls = innerWalls(grid);
    shuffle(walls);
    for (let w of walls) {
        if (w.a.setid !== w.b.setid) {
            w.remove();
            //console.log('sids', w.a.setid, w.b.setid);
            let aset = sets[w.a.setid], bset = sets[w.b.setid];
            delete sets[w.b.setid];
            for (let cell of bset) {
                cell.setid = w.a.setid;
                aset.push(cell);
            }
        }
    }
    return grid;
}

function k2(nrows, ncols) {
    // Assign each square in the grid a set id, initially unique.
    let grid = makeGrid(nrows, ncols)
    let sets = {}; // map setid to cells
    for (let i = 0; i < nrows; i++) {
        for (let j = 0; j < ncols; j++) {
            grid[i][j].setid = i*ncols+j;
            sets[grid[i][j].setid] = [grid[i][j]];
        }
    }
    // Until there's only one set, loop over the walls in random order and break down each
    // wall between two different sets.
    let walls = innerWalls(grid);
    shuffle(walls);
    for (let w of walls) {
        if (w.a.setid !== w.b.setid && Math.random() < 0.2) {
            w.remove();
            let aset = sets[w.a.setid], bset = sets[w.b.setid];
            delete sets[w.b.setid];
            for (let cell of bset) {
                cell.setid = w.a.setid;
                aset.push(cell);
            }
        }
    }
    return grid;
}

// Connect all unconnected cells with randomized depth-first search.
function rdfs(grid) {
    let nrows = grid.length, ncols = grid[0].length;
    let startcell = grid[randint(nrows)][randint(ncols)];
    
    function go(cell) {
        cell.visited = true;
        let dirs = Object.values(Direction)
        shuffle(dirs);
        for (let dir of dirs) {
            let neighbor = cell.neighbors[dir];
            if (neighbor && !neighbor.visited && !cell.walls[dir]) {
                go(neighbor);
            }
        }
        for (let dir of dirs) {
            let neighbor = cell.neighbors[dir];
            if (neighbor && !neighbor.visited) {
                cell.removeWall(dir);
                go(neighbor);
            }
        }
    }
    go(startcell);
}
                
function hallwaysLong(grid, nhoriz, nvert) {
    let nrows = grid.length, ncols = grid[0].length;

    for (let i = 0; i < nhoriz; i++) {
        let row = randint(nrows);
        let s = randint(ncols), e = randint(ncols);
        if (s > e) [s, e] = [e, s];
        for (let j = s; j < e; j++) {
            grid[row][j].removeWall(Direction.RIGHT);
        }
    }

    for (let i = 0; i < nvert; i++) {
        let col = randint(ncols);
        let s = randint(nrows), e = randint(nrows);
        if (s > e) [s, e] = [e, s];
        for (let j = s; j < e; j++) {
            grid[j][col].removeWall(Direction.UP);
        }
    }
}

function hallwaysShort(grid, nhoriz, nvert) {
    let nrows = grid.length, ncols = grid[0].length;

    for (let i = 0; i < nhoriz; i++) {
        let row = randint(nrows);
        let s = Math.ceil(randint(ncols)/2 + ncols/4), e = Math.floor(s + randint(ncols/4) - ncols/4);
        if (s > e) [s, e] = [e, s];
        for (let j = s; j < e; j++) {
            grid[row][j].removeWall(Direction.RIGHT);
        }
    }

    for (let i = 0; i < nhoriz; i++) {
        let col = randint(ncols);
        let s = Math.ceil(randint(nrows)/2 + nrows/4), e = Math.floor(s + randint(nrows/4) - nrows/4);
        if (s > e) [s, e] = [e, s];
        for (let j = s; j < e; j++) {
            grid[j][col].removeWall(Direction.UP);
        }
    }
}

////////////////////////////////////////////////////////////////////////////////

nrows = 60, ncols = 130;

function showit() { document.getElementById("generated-maze").innerHTML = htmlForGrid(g); }

function show_rdfs() {
    g = makeGrid(nrows, ncols);
    rdfs(g);
    showit();
}

function show_kruskal() {
    g = kruskal(nrows, ncols);
    showit();
}

function show_hybrid() {
    g = k2(nrows, ncols);
    hallwaysShort(g, 5, 5);
    rdfs(g);
    showit();
}

function show_hallways() {
    g = makeGrid(nrows, ncols);
    hallwaysLong(g, 5, 5);
    hallwaysShort(g, 20, 20);
    rdfs(g);
    showit();
}
