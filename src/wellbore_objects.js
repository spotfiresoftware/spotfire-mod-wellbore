/*
 * Copyright © 2024. Cloud Software Group, Inc.
 * This file is subject to the license terms contained
 * in the license file that is distributed with this file.
 */

class TrajectoryWaypoint {
    constructor(md, tvd, diameter) {
        this.md = md;
        this.tvd = tvd;
        this.diameter = diameter;
    }
}


class MDValue {
    constructor(md, value, color, colorValue, row) {
        this.md = md;
        this.value = value;
        this.color = color;
        this.colorValue = colorValue;
        this.row = row;
    }
}

class MDFill {
    constructor(md, color, colorValue, row) {
        this.md = md;
        this.color = color;
        this.colorValue = colorValue;
        this.row = row;
    }
}


class Plug {
    constructor(md, color, colorValue, row) {
        this.md = md;
        this.color = color;
        this.colorValue = colorValue;
        this.row = row;
    }
}



class Perforation {
    constructor(startMD, endMD, color, colorValue, row) {
        this.startMD = startMD;
        this.endMD = endMD;
        this.color = color;
        this.colorValue = colorValue;
        this.row = row;
    }
}



class Gun {
    constructor(md, color, colorValue, row) {
        this.md = md;
        this.color = color;
        this.colorValue = colorValue;
        this.row = row;
    }
}