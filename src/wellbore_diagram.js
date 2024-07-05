/*
 * Copyright © 2024. Cloud Software Group, Inc.
 * This file is subject to the license terms contained
 * in the license file that is distributed with this file.
 */

class WellboreDiagram {
    static DEFAULT_COLOR = '#FAA264';

    // Margins
    static TOP_MARGIN = 10;
    static RIGHT_MARGIN = 10;
    static BOTTOM_MARGIN = 30;
    static LEFT_MARGIN = 50;

    // Declare properties set in constructor
    #canvasElem;
    #actions;
    #zoomRange;

    // Declare properties set in draw
    #configuration;
    #groupMap;
    #group;
    #diagramElem;
    #scales;

    constructor(canvasElem, actions, zoomRange) {
        this.#canvasElem = canvasElem;
        this.#actions = actions;

        // Set the zoom range
        this.#zoomRange = zoomRange;
    }

    // Draw diagram
    draw(groupMap, configuration) {
        // Set properties
        if(groupMap != null)
            this.#groupMap = groupMap;
        if(configuration != null)
            this.#configuration = configuration;
        this.#draw();
    }

    // Draw diagram
    #draw() {        
        // Get the data and canvas
        const groupMap = this.#groupMap;
        const configuration = this.#configuration;
        const canvasElem = this.#canvasElem;

        // Clear the canvas
        canvasElem.innerHTML = '';

        // Extract group data and set
        const group = groupMap[null];
        if(group == null) return;
        this.#group = group;

        // Build the dataset
        const extents = this.#buildData(group);

        // Create diagram and append
        const diagramElem = document.createElement('div');
        diagramElem.classList.add('wellbore-diagram');
        diagramElem.classList.add('interactive');
        canvasElem.appendChild(diagramElem);
        this.#diagramElem = diagramElem;

        // Set margins, height, width
        const margin = {
            top: WellboreDiagram.TOP_MARGIN, 
            right: WellboreDiagram.RIGHT_MARGIN, 
            bottom: WellboreDiagram.BOTTOM_MARGIN, 
            left: WellboreDiagram.LEFT_MARGIN
        };

        const width = diagramElem.clientWidth - margin.left - margin.right;
        const height = diagramElem.clientHeight - margin.top - margin.bottom;
        
        // Build data
        const calcDomainsResult = this.#calculateDomains(extents, width, height);

        // Draw SVG
        const svg = d3.select(diagramElem)
            .append('svg')
                .attr('width', width)
                .attr('height', height);

        // Draw SVG group for offset, this will contain all further components
        const svgTransformG = svg.append('g')
            .append('g')
                .attr('transform',
                    'translate(' + margin.left + ',' + margin.top + ')');

        // Create a Mask defs for clip path. This is used with zoom sliders to prevent
        //   components displaying outside the axes
        const mask = svg.append("defs")
            .append("clipPath")
                .attr("id", "mask")
                .style("pointer-events", "none")
            .append("rect")
                .attr('x', 0)
                .attr('y', 0)
                .attr('width', width)
                .attr('height', height);

        // Debugging rect
        /*svg.append('rect')
            .attr('x', 0)
            .attr('y', 0)
            .attr('height', '100%')
            .attr('width', '100%')
            .attr('fill', 'pink');*/

        // Draw axis scales
        const scales = this.#drawScales(svgTransformG, calcDomainsResult.x_domain, calcDomainsResult.y_domain, width, height);
        this.#scales = scales;

        // Create group for to hold plot elements that will be clipped with mask
        // This is added after the scales are drawn so grids aren't overlaid on wellbore
        const svgMaskedG = svgTransformG.append('g')
            .attr("clip-path", "url(#mask)");

        // Draw diagram
        this.#drawDiagram(svgMaskedG, group, scales);

        // Append event handlers
        this.#appendEventHandlers(diagramElem);

        // Set markable class if marking enabled
        if(this.#configuration.marking != null) {
            diagramElem.classList.add('markable');
        }
        else {
            diagramElem.classList.remove('markable');
        }
    }

    /* ---------------------------------------------------------------------------------------------------- */
    /* CALCULATIONS */

    // Build data for rendering
    #buildData(group) {
        // Initialize arrays for each type
        group.waypoints = [];
        group.values = [];
        group.fills = [];
        group.plugs = [];
        group.perforations = [];
        group.guns= [];

        // Sort rows into arrays
        for(let thisData of group.getData()) {
            // Create appropriate data object and add to group
            if(thisData.layerType == "Trajectory" && thisData.md != null && thisData.tvd != null && thisData.diameter != null) {                
                const waypointObj = new TrajectoryWaypoint(thisData.md, thisData.tvd, thisData.diameter);
                group.waypoints.push(waypointObj);
            }
            else if(thisData.layerType == "Value" && thisData.md != null && thisData.value != null) {
                const valueObj = new MDValue(thisData.md, thisData.value, thisData.color, thisData.colorValue, thisData.row);
                group.values.push(valueObj);
            }
            else if(thisData.layerType == "Fill" && thisData.md != null) {
                const fillObj = new MDFill(thisData.md, thisData.color, thisData.colorValue, thisData.row);
                group.fills.push(fillObj);
            }
            else if(thisData.layerType == "Plug" && thisData.md != null) {
                const plugObj = new Plug(thisData.md, thisData.color, thisData.colorValue, thisData.row);
                group.plugs.push(plugObj);
            }
            else if(thisData.layerType == "Perforation" && thisData.perfStartMD != null && thisData.perfEndMD != null) {
                const perforationObj = new Perforation(thisData.perfStartMD, thisData.perfEndMD, thisData.color, thisData.colorValue, thisData.row);
                group.perforations.push(perforationObj);
            }
            else if(thisData.layerType == "Gun" && thisData.md != null) {
                const gunObj = new Gun(thisData.md, thisData.color, thisData.colorValue, thisData.row);
                group.guns.push(gunObj);
            }
        }
        
        // Sort waypoints and values by MD
        group.waypoints.sort((a, b) => a.md - b.md);
        group.values.sort((a, b) => a.md - b.md);

        // Create array to hold polygons
        group.polygons = [];

        // Calculate trig
        return this.#calculateTrig(group);
    }
    
    // Calculate trigonometric parameters
    #calculateTrig(group) {
        // Extract waypoints
        const waypoints = group.waypoints;
        if(waypoints == null || waypoints.length == 0) return;

        // Setup first waypoint center reference
        const firstWaypoint = waypoints[0];
        firstWaypoint.centerX = 0;
        firstWaypoint.centerY = Math.abs(firstWaypoint.tvd);

        const extents = {
            minX: Number.MAX_SAFE_INTEGER,
            maxX: Number.MIN_SAFE_INTEGER,
            minY: Number.MAX_SAFE_INTEGER,
            maxY: Number.MIN_SAFE_INTEGER
        };

        // Loop over trajectory waypoints and calculate angles and centers
        for(let currentIndex = 0; currentIndex < waypoints.length; currentIndex++) {
            const thisWaypoint = waypoints[currentIndex];
            const nextWaypoint = waypoints[currentIndex + 1];
            const prevWaypoint = waypoints[currentIndex - 1];
            
            // Calculate angles
            if(nextWaypoint != null) {
                thisWaypoint.a1 = Math.asin(Math.abs(nextWaypoint.tvd - thisWaypoint.tvd)/Math.abs(nextWaypoint.md - thisWaypoint.md));
                thisWaypoint.a2 = Math.PI / 2 - thisWaypoint.a1;
            }

            // Calculate centers
            if(prevWaypoint != null) {
                thisWaypoint.centerX = prevWaypoint.centerX + (thisWaypoint.md - prevWaypoint.md) * Math.cos(prevWaypoint.a1);                
                //thisWaypoint.centerY = prevWaypoint.centerY + (thisWaypoint.md - prevWaypoint.md) * Math.sin(prevWaypoint.a1);
                thisWaypoint.centerY = Math.abs(thisWaypoint.tvd);                
                thisWaypoint.segLen = thisWaypoint.md  - prevWaypoint.md;
            }

            // Update extents with centers
            extents.minX = Math.min(extents.minX, thisWaypoint.centerX);
            extents.maxX = Math.max(extents.maxX, thisWaypoint.centerX);
            extents.minY = Math.min(extents.minY, thisWaypoint.centerY);
            extents.maxY = Math.max(extents.maxY, thisWaypoint.centerY);
        }

        // Create borehole waypoints
        group.borehole = {
            left: [],
            right: []
        }

        // Loop again to calculate boreholes
        for(let currentIndex = 0; currentIndex < waypoints.length; currentIndex++) {
            const thisWaypoint = waypoints[currentIndex];
            const nextWaypoint = waypoints[currentIndex + 1];
            if(nextWaypoint == null) break;

            const boreholeRight = {};
            const boreholeLeft = {};
            thisWaypoint.boreholeRight = boreholeRight;
            thisWaypoint.boreholeLeft = boreholeLeft;

            // Calcluate right/left start
            boreholeRight.startX = thisWaypoint.centerX + thisWaypoint.diameter / 2 * Math.cos(thisWaypoint.a2);
            boreholeRight.startY = thisWaypoint.centerY - thisWaypoint.diameter / 2 * Math.sin(thisWaypoint.a2);
            boreholeLeft.startX = thisWaypoint.centerX - thisWaypoint.diameter / 2 * Math.cos(thisWaypoint.a2);
            boreholeLeft.startY = thisWaypoint.centerY + thisWaypoint.diameter / 2 * Math.sin(thisWaypoint.a2);

            // Calculate right/left end
            boreholeRight.endX = nextWaypoint.centerX + thisWaypoint.diameter / 2 * Math.cos(thisWaypoint.a2);
            boreholeRight.endY = nextWaypoint.centerY - thisWaypoint.diameter / 2 * Math.sin(thisWaypoint.a2);
            boreholeLeft.endX = nextWaypoint.centerX - thisWaypoint.diameter / 2 * Math.cos(thisWaypoint.a2);
            boreholeLeft.endY = nextWaypoint.centerY + thisWaypoint.diameter / 2 * Math.sin(thisWaypoint.a2);

            // Set MD for first waypoints
            if(currentIndex == 0) {
                boreholeRight.md = thisWaypoint.md;
                boreholeLeft.md = thisWaypoint.md;
            }

            group.borehole.right.push(boreholeRight);
            group.borehole.left.push(boreholeLeft);

            extents.minX = Math.min(extents.minX, boreholeRight.startX, boreholeLeft.startX, boreholeRight.endX, boreholeLeft.endX);
            extents.maxX = Math.max(extents.maxX, boreholeRight.startX, boreholeLeft.startX, boreholeRight.endX, boreholeLeft.endX);
            extents.minY = Math.min(extents.minY, boreholeRight.startY, boreholeLeft.startY, boreholeRight.endY, boreholeLeft.endY);
            extents.maxY = Math.max(extents.maxY, boreholeRight.startY, boreholeLeft.startY, boreholeRight.endY, boreholeLeft.endY);
        }

        // Correct for overlaps on right and left
        this.#correctOverlaps(group.borehole.right);
        this.#correctOverlaps(group.borehole.left);

        return extents;
    }

    // Correct overlaps on borehole walls
    #correctOverlaps(waypoints) {
        for(let currentIndex = 0; currentIndex < waypoints.length; currentIndex++) {
            const thisWaypoint = waypoints[currentIndex];
            const nextWaypoint = waypoints[currentIndex + 1];

            // Calculate MD
            if(currentIndex > 0) {
                const prevWaypoint = waypoints[currentIndex - 1];
                thisWaypoint.segLen = Math.sqrt(Math.pow(thisWaypoint.startX - thisWaypoint.endX, 2) + Math.pow(thisWaypoint.startY - thisWaypoint.endY, 2));
                thisWaypoint.md = prevWaypoint.md + thisWaypoint.segLen;
            }

            if(nextWaypoint == null) break;

            // If start and end do not match, then find the intersection
            if(Math.abs(thisWaypoint.endX - nextWaypoint.startX) > 0.1 || Math.abs(thisWaypoint.endY - nextWaypoint.startY) > 0.1) {
                // Find the intersection of this and next waypoints
                const intersection = this.#intersect(thisWaypoint.startX, thisWaypoint.startY, thisWaypoint.endX, thisWaypoint.endY, 
                    nextWaypoint.startX, nextWaypoint.startY, nextWaypoint.endX, nextWaypoint.endY);

                // If there is an intersection then there's an overlap, so correct
                if(intersection != null && intersection != false) {
                    thisWaypoint.endX = intersection.x;
                    thisWaypoint.endY = intersection.y;
                    thisWaypoint.correctedEnd = true;

                    nextWaypoint.startX = intersection.x;
                    nextWaypoint.startY = intersection.y;
                    nextWaypoint.correctedStart = true;
                }
            }
        }
    }

    // Calculate the intersection point of two line segments
    // Used to correct overlaps and set fill polygons
    #intersect(x1, y1, x2, y2, x3, y3, x4, y4) {
        /*var ua, ub, denom = (y4 - y3)*(x2 - x1) - (x4 - x3)*(y2 - y1);
        if (denom == 0) {
            return null;
        }
        ua = ((x4 - x3)*(y1 - y3) - (y4 - y3)*(x1 - x3))/denom;
        ub = ((x2 - x1)*(y1 - y3) - (y2 - y1)*(x1 - x3))/denom;
        return {
            x: x1 + ua * (x2 - x1),
            y: y1 + ua * (y2 - y1),
            seg1: ua >= 0 && ua <= 1,
            seg2: ub >= 0 && ub <= 1
        };*/

        // Check if none of the lines are of length 0
        if ((x1 === x2 && y1 === y2) || (x3 === x4 && y3 === y4)) {
            return false
        }

        const denominator = ((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1))

        // Lines are parallel
        if (denominator === 0) {
            return false
        }

        const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denominator
        const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denominator

        // is the intersection along the segments
        if (ua < 0 || ua > 1 || ub < 0 || ub > 1) {
            return false
        }

        // Return a object with the x and y coordinates of the intersection
        const x = x1 + ua * (x2 - x1)
        const y = y1 + ua * (y2 - y1)

        return {x, y}        
    }

    // Calculate domains
    #calculateDomains(extents, width, height) {
        const zoomRange = this.#zoomRange;

        // Build arrays
        const x_domain = [extents.minX, extents.maxX];
        //const x_domain = [Math.abs(extents.minY), Math.abs(extents.maxY)]; // this is used to preserve aspect ratio of borehole
        const y_domain = [extents.minY, extents.maxY];

        // Update domains with zoom range
        if(zoomRange.x.rangeFrom > 0 || zoomRange.x.rangeTo < 1) {
            const x_span = x_domain[1] - x_domain[0];
            const x_fromDelta = x_span * zoomRange.x.rangeFrom;
            const x_toDelta = x_span * (1 - zoomRange.x.rangeTo);
            x_domain[1] = x_domain[1] - x_toDelta;
            x_domain[0] = x_domain[0] + x_fromDelta;
        }

        if(zoomRange.y.rangeFrom > 0 || zoomRange.y.rangeTo < 1) {
            const y_span = y_domain[1] - y_domain[0];
            const y_fromDelta = y_span * zoomRange.y.rangeFrom;
            const y_toDelta = y_span * (1 - zoomRange.y.rangeTo);
            y_domain[1] = y_domain[1] - y_toDelta;
            y_domain[0] = y_domain[0] + y_fromDelta;
        }

        // Applies a padding to x and y axes for wells
        // This will add/subtract 1/2 a standard tick interval to the upper and lower bound
        //   of each domain range
        // Wells use points with radius, this should allow the circles to remain
        //   within the plot area (hopefully)

        // Define x-axis
        const x = d3.scaleLinear()
            .domain(x_domain)
            .range([0, width]);
       
        const x_delta = (x.ticks()[0] - x.ticks()[1]) / 2;
        x_domain[0] = x_domain[0] + 5 * x_delta;
        x_domain[1] = x_domain[1];

        // Define y-axis
        const y = d3.scaleLinear()
            .domain(y_domain)
            .range([height, 0]);

        const y_delta = (y.ticks()[0] - y.ticks()[1]) / 2;
        y_domain[0] = y_domain[0];
        y_domain[1] = y_domain[1] - y_delta;

        // Return domains and sorted data
        return {
            x_domain: x_domain,
            y_domain: y_domain
        }
    }

    // Calculate fill polygons
    #calculateFillPolygonPoints(leadingMD, trailingMD, group) {
        const waypoints = group.waypoints;

        // Match leading MD
        const leadingMatchObj = this.#matchWaypoint(waypoints, leadingMD);
        const leadingMatchWaypoint = leadingMatchObj.waypoint;

        // Calculate leading MD center
        const leadingCenterX = leadingMatchWaypoint.centerX + (leadingMD - leadingMatchWaypoint.md) * Math.cos(leadingMatchWaypoint.a1);
        const leadingCenterY = leadingMatchWaypoint.centerY + (leadingMD - leadingMatchWaypoint.md) * Math.sin(leadingMatchWaypoint.a1);

        // Calculate leading MD to right borehole segment (diameter to compute intersection)
        const leadingRightX = leadingCenterX + leadingMatchWaypoint.diameter * Math.cos(leadingMatchWaypoint.a2);
        const leadingRightY = leadingCenterY - leadingMatchWaypoint.diameter * Math.sin(leadingMatchWaypoint.a2);

        // Calculate leading right intersection
        const leadingRightIntersect = this.#intersect(leadingCenterX, leadingCenterY, leadingRightX, leadingRightY,
            leadingMatchWaypoint.boreholeRight.startX, leadingMatchWaypoint.boreholeRight.startY, 
            leadingMatchWaypoint.boreholeRight.endX, leadingMatchWaypoint.boreholeRight.endY); 

        // Calculate leading MD to left borehole segment (diameter to compute intersection)
        const leadingLeftX = leadingCenterX - leadingMatchWaypoint.diameter * Math.cos(leadingMatchWaypoint.a2);
        const leadingLeftY = leadingCenterY + leadingMatchWaypoint.diameter * Math.sin(leadingMatchWaypoint.a2);

        // Calculate leading left intersection
        const leadingLeftIntersect = this.#intersect(leadingCenterX, leadingCenterY, leadingLeftX, leadingLeftY,
            leadingMatchWaypoint.boreholeLeft.startX, leadingMatchWaypoint.boreholeLeft.startY, 
            leadingMatchWaypoint.boreholeLeft.endX, leadingMatchWaypoint.boreholeLeft.endY); 



        // Match trailing MD
        const trailingMatchObj = this.#matchWaypoint(waypoints, trailingMD);
        const trailingMatchWaypoint = trailingMatchObj.waypoint;

        // Calculate trailing MD center
        const trailingCenterX = trailingMatchWaypoint.centerX + (trailingMD - trailingMatchWaypoint.md) * Math.cos(trailingMatchWaypoint.a1);
        const trailingCenterY = trailingMatchWaypoint.centerY + (trailingMD - trailingMatchWaypoint.md) * Math.sin(trailingMatchWaypoint.a1);

        // Calculate trailing MD to left borehole segment (diameter to compute intersection)
        const trailingLeftX = trailingCenterX - trailingMatchWaypoint.diameter * Math.cos(trailingMatchWaypoint.a2);
        const trailingLeftY = trailingCenterY + trailingMatchWaypoint.diameter * Math.sin(trailingMatchWaypoint.a2);

        // Calculate trailing left intersection
        const trailingLeftIntersect = this.#intersect(trailingCenterX, trailingCenterY, trailingLeftX, trailingLeftY,
            trailingMatchWaypoint.boreholeLeft.startX, trailingMatchWaypoint.boreholeLeft.startY, 
            trailingMatchWaypoint.boreholeLeft.endX, trailingMatchWaypoint.boreholeLeft.endY); 
        
        // Calculate trailing MD to right borehole segment (diameter to compute intersection)
        const trailingRightX = trailingCenterX + trailingMatchWaypoint.diameter * Math.cos(trailingMatchWaypoint.a2);
        const trailingRightY = trailingCenterY - trailingMatchWaypoint.diameter * Math.sin(trailingMatchWaypoint.a2);

        // Calculate trailing right intersection
        const trailingRightIntersect = this.#intersect(trailingCenterX, trailingCenterY, trailingRightX, trailingRightY,
            trailingMatchWaypoint.boreholeRight.startX, trailingMatchWaypoint.boreholeRight.startY, 
            trailingMatchWaypoint.boreholeRight.endX, trailingMatchWaypoint.boreholeRight.endY); 

        // Setup points array
        const pointsArr = [];

        // Leading right point
        if(leadingRightIntersect != null && leadingRightIntersect != false) {
            pointsArr.push([leadingRightIntersect.x, leadingRightIntersect.y]);           
        }
        else {
            const dEnd = Math.sqrt(Math.pow(leadingRightX - leadingMatchWaypoint.boreholeRight.endX, 2) + Math.pow(leadingRightY - leadingMatchWaypoint.boreholeRight.endY, 2))
            const dStart = Math.sqrt(Math.pow(leadingRightX - leadingMatchWaypoint.boreholeRight.startX, 2) + Math.pow(leadingRightY - leadingMatchWaypoint.boreholeRight.startY, 2))
            if(dEnd < dStart) {
                pointsArr.push([leadingMatchWaypoint.boreholeRight.endX, leadingMatchWaypoint.boreholeRight.endY]);           
            }
            else {
                pointsArr.push([leadingMatchWaypoint.boreholeRight.startX, leadingMatchWaypoint.boreholeRight.startY]);           
            }
        }

        // Leading left point
        if(leadingLeftIntersect != null && leadingLeftIntersect != false) {
            pointsArr.push([leadingLeftIntersect.x, leadingLeftIntersect.y]);           
        }
        else {
            const dEnd = Math.sqrt(Math.pow(leadingLeftX - leadingMatchWaypoint.boreholeLeft.endX, 2) + Math.pow(leadingLeftY - leadingMatchWaypoint.boreholeLeft.endY, 2))
            const dStart = Math.sqrt(Math.pow(leadingLeftX - leadingMatchWaypoint.boreholeLeft.startX, 2) + Math.pow(leadingLeftY - leadingMatchWaypoint.boreholeLeft.startY, 2))
            if(dEnd < dStart) {
                pointsArr.push([leadingMatchWaypoint.boreholeLeft.endX, leadingMatchWaypoint.boreholeLeft.endY]);           
            }
            else {
                pointsArr.push([leadingMatchWaypoint.boreholeLeft.startX, leadingMatchWaypoint.boreholeLeft.startY]);           
            }
        }       

        // Follow the borehole left
        if(leadingMatchObj.index > trailingMatchObj.index) {
            pointsArr.push([leadingMatchWaypoint.boreholeLeft.startX, leadingMatchWaypoint.boreholeLeft.startY]);           
            for(let idx = leadingMatchObj.index - 1; idx > trailingMatchObj.index; idx--) {
                const thisWaypoint = waypoints[idx];
                pointsArr.push([thisWaypoint.boreholeLeft.endX, thisWaypoint.boreholeLeft.endY]);           
                pointsArr.push([thisWaypoint.boreholeLeft.startX, thisWaypoint.boreholeLeft.startY]);           
            }
            pointsArr.push([trailingMatchWaypoint.boreholeLeft.endX, trailingMatchWaypoint.boreholeLeft.endY]);           
        }

        // Trailing left point
        if(trailingLeftIntersect != null && trailingLeftIntersect != false) {
            pointsArr.push([trailingLeftIntersect.x, trailingLeftIntersect.y]);           
        }
        else {
            const dEnd = Math.sqrt(Math.pow(trailingLeftX - trailingMatchWaypoint.boreholeLeft.endX, 2) + Math.pow(trailingLeftY - trailingMatchWaypoint.boreholeLeft.endY, 2))
            const dStart = Math.sqrt(Math.pow(trailingLeftX - trailingMatchWaypoint.boreholeLeft.startX, 2) + Math.pow(trailingLeftY - trailingMatchWaypoint.boreholeLeft.startY, 2))
            if(dEnd < dStart) {
                pointsArr.push([trailingMatchWaypoint.boreholeLeft.endX, trailingMatchWaypoint.boreholeLeft.endY]);           
            }
            else {
                pointsArr.push([trailingMatchWaypoint.boreholeLeft.startX, trailingMatchWaypoint.boreholeLeft.startY]);           
            }
        }
        
        // Trailing right point
        if(trailingRightIntersect != null && trailingRightIntersect != false) {
            pointsArr.push([trailingRightIntersect.x, trailingRightIntersect.y]);           
        }
        else {
            const dEnd = Math.sqrt(Math.pow(trailingRightX - trailingMatchWaypoint.boreholeRight.endX, 2) + Math.pow(trailingRightY - trailingMatchWaypoint.boreholeRight.endY, 2))
            const dStart = Math.sqrt(Math.pow(trailingRightX - trailingMatchWaypoint.boreholeRight.startX, 2) + Math.pow(trailingRightY - trailingMatchWaypoint.boreholeRight.startY, 2))
            if(dEnd < dStart) {
                pointsArr.push([trailingMatchWaypoint.boreholeRight.endX, trailingMatchWaypoint.boreholeRight.endY]);           
            }
            else {
                pointsArr.push([trailingMatchWaypoint.boreholeRight.startX, trailingMatchWaypoint.boreholeRight.startY]);           
            }
        }

        // Follow the borehole right
        if(leadingMatchObj.index > trailingMatchObj.index) {
            pointsArr.push([trailingMatchWaypoint.boreholeRight.endX, trailingMatchWaypoint.boreholeRight.endY]);           
            for(let idx = trailingMatchObj.index + 1; idx <= leadingMatchObj.index - 1; idx++) {
                const thisWaypoint = waypoints[idx];
                pointsArr.push([thisWaypoint.boreholeRight.startX, thisWaypoint.boreholeRight.startY]);           
                pointsArr.push([thisWaypoint.boreholeRight.endX, thisWaypoint.boreholeRight.endY]);           
            }
            pointsArr.push([leadingMatchWaypoint.boreholeRight.startX, leadingMatchWaypoint.boreholeRight.startY]);           
        }

        // Leading right point (again, this is needed to close the polygon properly)
        if(leadingRightIntersect != null && leadingRightIntersect != false) {
            pointsArr.push([leadingRightIntersect.x, leadingRightIntersect.y]);           
        }
        else {
            const dEnd = Math.sqrt(Math.pow(leadingRightX - leadingMatchWaypoint.boreholeRight.endX, 2) + Math.pow(leadingRightY - leadingMatchWaypoint.boreholeRight.endY, 2))
            const dStart = Math.sqrt(Math.pow(leadingRightX - leadingMatchWaypoint.boreholeRight.startX, 2) + Math.pow(leadingRightY - leadingMatchWaypoint.boreholeRight.startY, 2))
            if(dEnd < dStart) {
                pointsArr.push([leadingMatchWaypoint.boreholeRight.endX, leadingMatchWaypoint.boreholeRight.endY]);           
            }
            else {
                pointsArr.push([leadingMatchWaypoint.boreholeRight.startX, leadingMatchWaypoint.boreholeRight.startY]);           
            }
        }

        return pointsArr;
    }

    // Calculate perforation polygons
    #calculatePerfPolygonPoints(leadingMD, trailingMD, wallDelta, perfCount, perfLength, waypoints) {    
        const configuration = this.#configuration;
        
        const rightPointsArr = [];
        const leftPointsArr = [];
        

        let currentMD = trailingMD;
        let attachToWall = true;
        let count = 0;
        let firstIndex = null;
        let lastIndex = null;
        
        let firstRight = null;
        let firstLeft = null;
        
        while(count <= perfCount * 2) {
            // Match current MD
            const matchWaypointObj = this.#matchWaypoint(waypoints, currentMD);
            const matchWaypoint = matchWaypointObj.waypoint;
            if(firstIndex == null) firstIndex = matchWaypointObj.index
            lastIndex = matchWaypointObj.index;

            // Calculate center position for MD
            const centerX = matchWaypoint.centerX + (currentMD - matchWaypoint.md) * Math.cos(matchWaypoint.a1);
            const centerY = matchWaypoint.centerY + (currentMD - matchWaypoint.md) * Math.sin(matchWaypoint.a1);

            // Calculate right borehole position for MD (diameter to compute intersection)
            const rightBoreX = centerX + matchWaypoint.diameter * Math.cos(matchWaypoint.a2);
            const rightBoreY = centerY - matchWaypoint.diameter * Math.sin(matchWaypoint.a2);
            
            // Calculate right intersection
            const rightIntersect = this.#intersect(centerX, centerY, rightBoreX, rightBoreY,
                matchWaypoint.boreholeRight.startX, matchWaypoint.boreholeRight.startY, 
                matchWaypoint.boreholeRight.endX, matchWaypoint.boreholeRight.endY); 

            // Calculate left borehole position for MD (diameter to compute intersection)
            const leftBoreX = centerX - matchWaypoint.diameter * Math.cos(matchWaypoint.a2);
            const leftBoreY = centerY + matchWaypoint.diameter * Math.sin(matchWaypoint.a2);
            
            // Calculate left intersection
            const leftIntersect = this.#intersect(centerX, centerY, leftBoreX, leftBoreY,
                matchWaypoint.boreholeLeft.startX, matchWaypoint.boreholeLeft.startY, 
                matchWaypoint.boreholeLeft.endX, matchWaypoint.boreholeLeft.endY); 

            // If attach to wall, then add the right and left borehole intersections to appropriate array
            if(attachToWall == true) {
                let rightPoint, leftPoint;

                // If right intersect is found and it does intersect the wall, use that position
                if(rightIntersect != null && rightIntersect != false) {
                    rightPoint = [rightIntersect.x, rightIntersect.y];
                }
                // Otherwise calculate using cartesian
                else {
                    const dEnd = Math.sqrt(Math.pow(rightBoreX - matchWaypoint.boreholeRight.endX, 2) + Math.pow(rightBoreY - matchWaypoint.boreholeRight.endY, 2))
                    const dStart = Math.sqrt(Math.pow(rightBoreX - matchWaypoint.boreholeRight.startX, 2) + Math.pow(rightBoreY - matchWaypoint.boreholeRight.startY, 2))
                    if(dEnd < dStart)
                        rightPoint = [matchWaypoint.boreholeRight.endX, matchWaypoint.boreholeRight.endY];
                    else
                        rightPoint = [matchWaypoint.boreholeRight.startX, matchWaypoint.boreholeRight.startY];
                }
                rightPointsArr.push(rightPoint);
                if(firstRight == null) firstRight = rightPoint;

                // If left intersect is found and it does intersect the wall, use that position
                if(leftIntersect != null && leftIntersect != false) {
                    leftPoint = [leftIntersect.x, leftIntersect.y];
                }
                // Otherwise calculate using cartesian
                else {
                    const dEnd = Math.sqrt(Math.pow(leftBoreX - matchWaypoint.boreholeLeft.endX, 2) + Math.pow(leftBoreY - matchWaypoint.boreholeLeft.endY, 2))
                    const dStart = Math.sqrt(Math.pow(leftBoreX - matchWaypoint.boreholeLeft.startX, 2) + Math.pow(leftBoreY - matchWaypoint.boreholeLeft.startY, 2))
                    if(dEnd < dStart)
                        leftPoint = [matchWaypoint.boreholeLeft.endX, matchWaypoint.boreholeLeft.endY];
                    else
                        leftPoint = [matchWaypoint.boreholeLeft.startX, matchWaypoint.boreholeLeft.startY];
                }
                leftPointsArr.push(leftPoint);
                if(firstLeft == null) firstLeft = leftPoint;
            }
            // Otherwise it's a perf apex
            else {
                // Calculate right apex position (thisPerfLength to compute intersection)
                const thisPerfLength = matchWaypoint.diameter / 2 + perfLength;
                const rightApexX = centerX + thisPerfLength * Math.cos(matchWaypoint.a2);
                const rightApexY = centerY - thisPerfLength * Math.sin(matchWaypoint.a2);
                rightPointsArr.push([rightApexX, rightApexY]);

                // Calculate left apex position (thisPerfLength to compute intersection)
                const leftApexX = centerX - thisPerfLength * Math.cos(matchWaypoint.a2);
                const leftApexY = centerY + thisPerfLength * Math.sin(matchWaypoint.a2);
                leftPointsArr.push([leftApexX, leftApexY]);
            }

            // Toggle the attach flag and increment the currentMD
            attachToWall = !attachToWall;
            currentMD += wallDelta / 2;
            count++;
        }

        // If first and last indices are different, need to follow the borehole backwards to close properly
        if(lastIndex > firstIndex) {
            // Follow the borehole backwards
            for(let idx = lastIndex; idx >= firstIndex - 1; idx--) {
                const thisWaypoint = waypoints[idx];
                if(idx < lastIndex)
                    rightPointsArr.push([thisWaypoint.boreholeRight.endX, thisWaypoint.boreholeRight.endY]);           
                if(idx > firstIndex)
                    rightPointsArr.push([thisWaypoint.boreholeRight.startX, thisWaypoint.boreholeRight.startY]);

                if(idx < lastIndex)
                    leftPointsArr.push([thisWaypoint.boreholeLeft.endX, thisWaypoint.boreholeLeft.endY]);           
                if(idx > firstIndex)
                    leftPointsArr.push([thisWaypoint.boreholeLeft.startX, thisWaypoint.boreholeLeft.startY]);           
            }
        }

        // Always add back the first point to close the polygon properly
        rightPointsArr.push(firstRight);
        leftPointsArr.push(firstLeft);

        const returnArr = [];
        if(configuration.perforationRight == true)
            returnArr.push(rightPointsArr);
        if(configuration.perforationLeft == true)
            returnArr.push(leftPointsArr);

        return returnArr;
    }

    // Calculate gun polygons
    #calculateGunPolygonPoints(md, group, gunWidth) {
        const waypoints = group.waypoints;

        // Match MD
        const matchObj = this.#matchWaypoint(waypoints, md);
        const matchWaypoint = matchObj.waypoint;

        // Calculate MD center
        const centerX = matchWaypoint.centerX + (md - matchWaypoint.md) * Math.cos(matchWaypoint.a1);
        const centerY = matchWaypoint.centerY + (md - matchWaypoint.md) * Math.sin(matchWaypoint.a1);

        // Calculate leading and trailing MD offset
        const leadingOffsetX = matchWaypoint.centerX + (md - matchWaypoint.md + gunWidth / 2) * Math.cos(matchWaypoint.a1);
        const leadingOffsetY = matchWaypoint.centerY + (md - matchWaypoint.md + gunWidth / 2) * Math.sin(matchWaypoint.a1);

        const trailingOffsetX = matchWaypoint.centerX + (md - matchWaypoint.md - gunWidth / 2) * Math.cos(matchWaypoint.a1);
        const trailingOffsetY = matchWaypoint.centerY + (md - matchWaypoint.md - gunWidth / 2) * Math.sin(matchWaypoint.a1);

        // Calculate MD to right borehole segment (diameter to compute intersection)
        const rightX = centerX + matchWaypoint.diameter * Math.cos(matchWaypoint.a2);
        const rightY = centerY - matchWaypoint.diameter * Math.sin(matchWaypoint.a2);

        // Calculate leading right intersection
        const rightIntersect = this.#intersect(centerX, centerY, rightX, rightY,
            matchWaypoint.boreholeRight.startX, matchWaypoint.boreholeRight.startY, 
            matchWaypoint.boreholeRight.endX, matchWaypoint.boreholeRight.endY); 

        // Calculate leading MD to left borehole segment (diameter to compute intersection)
        const leftX = centerX - matchWaypoint.diameter * Math.cos(matchWaypoint.a2);
        const leftY = centerY + matchWaypoint.diameter * Math.sin(matchWaypoint.a2);

        // Calculate leading left intersection
        const leftIntersect = this.#intersect(centerX, centerY, leftX, leftY,
            matchWaypoint.boreholeLeft.startX, matchWaypoint.boreholeLeft.startY, 
            matchWaypoint.boreholeLeft.endX, matchWaypoint.boreholeLeft.endY); 




        // Setup points array
        const pointsArr = [];

        // Trailing center
        pointsArr.push([trailingOffsetX, trailingOffsetY]);

        // Right point
        if(rightIntersect != null && rightIntersect != false) {
            pointsArr.push([rightIntersect.x, rightIntersect.y]);           
        }
        else {
            const dEnd = Math.sqrt(Math.pow(rightX - matchWaypoint.boreholeRight.endX, 2) + Math.pow(leadingRightY - matchWaypoint.boreholeRight.endY, 2))
            const dStart = Math.sqrt(Math.pow(rightX - matchWaypoint.boreholeRight.startX, 2) + Math.pow(leadingRightY - matchWaypoint.boreholeRight.startY, 2))
            if(dEnd < dStart) {
                pointsArr.push([matchWaypoint.boreholeRight.endX, matchWaypoint.boreholeRight.endY]);           
            }
            else {
                pointsArr.push([matchWaypoint.boreholeRight.startX, matchWaypoint.boreholeRight.startY]);           
            }
        }

        // Leading center
        pointsArr.push([leadingOffsetX, leadingOffsetY]);

        // Left point
        if(leftIntersect != null && leftIntersect != false) {
            pointsArr.push([leftIntersect.x, leftIntersect.y]);           
        }
        else {
            const dEnd = Math.sqrt(Math.pow(leadingLeftX - matchWaypoint.boreholeLeft.endX, 2) + Math.pow(leadingLeftY - matchWaypoint.boreholeLeft.endY, 2))
            const dStart = Math.sqrt(Math.pow(leadingLeftX - matchWaypoint.boreholeLeft.startX, 2) + Math.pow(leadingLeftY - matchWaypoint.boreholeLeft.startY, 2))
            if(dEnd < dStart) {
                pointsArr.push([matchWaypoint.boreholeLeft.endX, matchWaypoint.boreholeLeft.endY]);           
            }
            else {
                pointsArr.push([matchWaypoint.boreholeLeft.startX, matchWaypoint.boreholeLeft.startY]);           
            }
        }       

        // Trailing center to close the polygon
        pointsArr.push([trailingOffsetX, trailingOffsetY]);

        return pointsArr;
    }


    // Match a waypoint for a given MD, for fill and value polygons
    #matchWaypoint(waypoints, md) {
        // Identify waypoints
        let matchWaypoint = null;
        let index = null;

        for(let idx = 0; idx < waypoints.length; idx++) {
            const thisWaypoint = waypoints[idx];
            if(thisWaypoint.md >= md) {
                matchWaypoint = thisWaypoint;
                index = idx;
                break;
            }
        }

        if(matchWaypoint.md == md || index == 0) {
            return {
                waypoint: matchWaypoint,
                index: index
            }
        }
        else {
            return {
                waypoint: waypoints[index - 1],
                index: index - 1
            }
        }
    }

    /* ---------------------------------------------------------------------------------------------------- */
    /* POLYLINE HELPERS */

    // Extracts centerline points and creates an array
    #getCenterLinePoints(waypoints, xScale, yScale) {
        let points = '';
        for(let thisWaypoint of waypoints) {
            points += xScale(thisWaypoint.centerX) + ',' + yScale(thisWaypoint.centerY) + ' ';
        }
        return points.trim();
    }

    // Extracts borehole wall waypoints and creates an array
    #getBoreholeLinePoints(waypoints, xScale, yScale) {
        let points = '';
        for(let currentIndex = 0; currentIndex < waypoints.length; currentIndex++) {
            const thisWaypoint = waypoints[currentIndex];
            points += xScale(thisWaypoint.startX) + ',' + yScale(thisWaypoint.startY) + ' ';
            points += xScale(thisWaypoint.endX) + ',' + yScale(thisWaypoint.endY) + ' ';
        }

        return points.trim();
    }

    // Converts an array of points in x,y format into a string for use with polyline
    #pointsArrToString(pointsArr, xScale, yScale) {
        let points = '';
        for(let idx = 0; idx < pointsArr.length; idx++) {
            const x = xScale != null ? xScale(pointsArr[idx][0]) : pointsArr[idx][0];
            const y = yScale != null ? yScale(pointsArr[idx][1]) : pointsArr[idx][1];
            points += x + ',' + y + ' ';
        }
        return points;
    }

    /* ---------------------------------------------------------------------------------------------------- */
    /* DRAW COMPONENTS */

    // Compute scales and draw x and y axis
    #drawScales(svg, x_domain, y_domain, width, height) {
        const configuration = this.#configuration;

        // Fudge factor to keep the scales at constrained aspect ratio
        const sf_y = height / (y_domain[1] - y_domain[0]);
        const sf_x = width / (x_domain[1] - x_domain[0]);

        if(sf_y < sf_x) {
            x_domain[1] = width/sf_y + x_domain[0];
        }
        else if(sf_y > sf_x) {
            y_domain[0] = y_domain[1] - height/sf_x;
        }

        // Define and append x-axis
        const xScale = d3.scaleLinear()
            .domain(x_domain)
            .range([0, width]);
       
        // Draw scale
        // xScale is never drawn
        if(configuration.scales.tvdScaleDisplay == true && false) {
            svg.append('g')
            .attr('class', 'scale scale-x')
            .attr('transform', 'translate(0,' + height + ')')
            .call(d3.axisBottom(xScale));                    
        }
        
        // Define and append y-axis
        const yScale = d3.scaleLinear()
            .domain(y_domain)
            .range([0, height]);

        // Draw scale
        if(configuration.scales.tvdScaleDisplay == true) {
            // Append y-axis
            svg.append('g')
                .attr('class', 'scale scale-y')
                .call(d3.axisLeft(yScale));
        }

        // Append grid Y if enabled
        if(configuration.scales.tvdScaleGridDisplay == true) {
            svg.append('g')
                .attr('class', 'grid grid-y')
                .selectAll('grid-y')      
                .data(yScale.ticks())
                .enter()
                    .append('line')
                        .attr('class', 'grid grid-y')
                        .attr('x1', xScale(x_domain[0]))
                        .attr('x2', xScale(x_domain[1]))
                        .attr('y1', function(d) { return yScale(d) })
                        .attr('y2', function(d) { return yScale(d) });
        }

        return {
            xScale: xScale,
            yScale: yScale
        }
    }

    // Draw diagram 
    #drawDiagram(svg, group, scales) {
        const diagramGroupElem = svg.append('g')
            .attr('class', 'diagram');                    

        // Draw borehole
        this.#drawBorehole(diagramGroupElem, group, scales.xScale, scales.yScale);

        // Draw values
        this.#drawValues(diagramGroupElem, group, scales.xScale, scales.yScale);

        // Draw fills
        this.#drawFills(diagramGroupElem, group, scales.xScale, scales.yScale);

        // Draw plugs
        this.#drawPlugs(diagramGroupElem, group, scales.xScale, scales.yScale);

        // Draw perforations
        this.#drawPerforations(diagramGroupElem, group, scales.xScale, scales.yScale);

        // Draw guns
        this.#drawGuns(diagramGroupElem, group, scales.xScale, scales.yScale);
    }

    // Draws borehole walls
    #drawBorehole(svg, group, xScale, yScale) {
        // Append polyline for center line
        const centerLinePoly = svg.append("polyline")
            .attr("class", "centerline")
            .attr("points", this.#getCenterLinePoints(group.waypoints, xScale, yScale));

        // Append polyline for borehole right
        svg.append("polyline")
            .attr("class", "boreline")
            .attr("points", this.#getBoreholeLinePoints(group.borehole.right, xScale, yScale));

        // Append polyline for borehole left
        svg.append("polyline")
            .attr("class", "boreline")
            .attr("points", this.#getBoreholeLinePoints(group.borehole.left, xScale, yScale));
    }

    // Draws value polygons
    #drawValues(svg, group, xScale, yScale) {
        const configuration = this.#configuration;
        const values = group.values;
        if(values == null) return;

        const waypoints = group.waypoints;

        for(let currentIndex = 0; currentIndex < values.length; currentIndex++) {
            const thisValue = values[currentIndex];

            const overlap = 5;

            // Calculate leading and trailing MD interval
            const prevValue = values[currentIndex - 1];
            const trailingMD = thisValue.md - (thisValue.md - (prevValue != null ? prevValue.md : thisValue.md)) / 2 - overlap;

            const nextValue = values[currentIndex + 1];
            const leadingMD = thisValue.md + ((nextValue != null ? nextValue.md : thisValue.md) - thisValue.md) / 2 + overlap;
        
            // Skip any values before first and beyond last waypoint
            if(trailingMD < waypoints[0].md)
                continue;
            if(leadingMD > waypoints[waypoints.length - 1].md)
                continue;

            // Calculate the points
            const pointsArr = this.#calculateFillPolygonPoints(leadingMD, trailingMD, group);
            const points = this.#pointsArrToString(pointsArr, xScale, yScale);

            // Draw polyline
            const polylineElem = svg.append("polyline")
                .attr("class", "value interactive selectable")
                .attr("points", points.trim())
                .attr("fill", thisValue.color)
                .attr("stroke", thisValue.color)
                .attr("value-index", currentIndex);

            // Push into the polygon array
            group.polygons.push({
                points: pointsArr,
                object: thisValue,
                type: 'value'
            });

            // Setup tooltip
            this.#setupTooltip(polylineElem.node(), thisValue.row);

            // Append event handler for marking if enabled
            if(configuration.marking != null) {
                polylineElem.node().addEventListener('click', function(event) {
                    event.stopPropagation();
                    if(event.ctrlKey == true)
                        thisValue.row.mark("Toggle");
                    else
                        thisValue.row.mark("Replace");
                });
            }
        }

    }

    // Draws fills
    #drawFills(svg, group, xScale, yScale) {
        const configuration = this.#configuration;
        const fills = group.fills;
        if(fills == null) return;

        const waypoints = group.waypoints;

        for(let currentIndex = 0; currentIndex < fills.length; currentIndex++) {
            const thisFill = fills[currentIndex];

            // Calculate leading and trailing MD interval
            const trailingMD = waypoints[0].md;
            const leadingMD = thisFill.md;
        
            // Skip any values before first and beyond last waypoint
            if(trailingMD < waypoints[0].md)
                continue;
            if(leadingMD > waypoints[waypoints.length - 1].md)
                continue;

            // Calculate the points
            const pointsArr = this.#calculateFillPolygonPoints(leadingMD, trailingMD, group);
            const points = this.#pointsArrToString(pointsArr, xScale, yScale);

            // Draw polyline
            const polylineElem = svg.append("polyline")
                .attr("class", "fill interactive selectable")
                .attr("points", points.trim())
                .attr("fill", thisFill.color)
                .attr("stroke", thisFill.color)
                .attr("value-index", currentIndex);

            // Push into the polygon array
            group.polygons.push({
                points: pointsArr,
                object: thisFill,
                type: 'fill'
            });

            // Setup tooltip
            this.#setupTooltip(polylineElem.node(), thisFill.row);

            // Append event handler for marking if enabled
            if(configuration.marking != null) {
                polylineElem.node().addEventListener('click', function(event) {
                    event.stopPropagation();
                    if(event.ctrlKey == true)
                        thisFill.row.mark("Toggle");
                    else
                        thisFill.row.mark("Replace");
                });
            }
        }
    }

    // Draws plugs
    #drawPlugs(svg, group, xScale, yScale) {
        const plugs = group.plugs;
        if(plugs == null) return;

        const configuration = this.#configuration;
        const waypoints = group.waypoints;

        for(let currentIndex = 0; currentIndex < plugs.length; currentIndex++) {
            const thisPlug = plugs[currentIndex];

            // Get configuration
            const plugSize = configuration.plugWidth;

            // Calculate leading and trailing MD interval
            const trailingMD = thisPlug.md - plugSize;
            const leadingMD = thisPlug.md + plugSize;

            // Skip any plugs before first and beyond last waypoint
            if(trailingMD < waypoints[0].md)
                continue;
            if(leadingMD > waypoints[waypoints.length - 1].md)
                continue;


            // Calculate the points
            const pointsArr = this.#calculateFillPolygonPoints(leadingMD, trailingMD, group);
            const points = this.#pointsArrToString(pointsArr, xScale, yScale);

            // Draw polyline
            const polylineElem = svg.append("polyline")
                .attr("class", "plug interactive")
                .attr("points", points.trim())
                //.attr("fill", thisPlug.color)
                //.attr("stroke", thisPlug.color)
                .attr("fill", configuration.plugColor)
                .attr("stroke", configuration.plugColor)
                .attr("value-index", currentIndex);

            // Setup tooltip
            this.#setupTooltip(polylineElem.node(), thisPlug.row);

            // Plugs are not markable
        }        
    }

    // Draws perforations
    #drawPerforations(svg, group, xScale, yScale) {
        const configuration = this.#configuration;
        const perforations = group.perforations;
        if(perforations == null) return;

        const waypoints = group.waypoints;

        for(let currentIndex = 0; currentIndex < perforations.length; currentIndex++) {
            const thisPerforation = perforations[currentIndex];
            const perfBaseline = thisPerforation.endMD - thisPerforation.startMD;

            // Get configuration
            const perfCount = Math.ceil(perfBaseline / this.#configuration.perforationBaseWidth);
            const wallDelta = perfBaseline / perfCount;
            const perfLength = this.#configuration.perforationLength;
            
            // Calculate leading and trailing
            const leadingMD = thisPerforation.endMD;
            const trailingMD = thisPerforation.startMD;

            // Skip any perforations before first and beyond last waypoint
            if(trailingMD < waypoints[0].md)
                continue;
            if(leadingMD > waypoints[waypoints.length - 1].md)
                continue;

            // Calculate polygon points
            const pointsArrList = this.#calculatePerfPolygonPoints(leadingMD, trailingMD, wallDelta, perfCount, perfLength, waypoints);

            for(let thisPointsArr of pointsArrList) {
                const points = this.#pointsArrToString(thisPointsArr, xScale, yScale);

                // Draw polyline
                const polylineElem = svg.append("polyline")
                    .attr("class", "perforation interactive")
                    .attr("points", points.trim())
                    //.attr("fill", thisPerforation.color)
                    //.attr("stroke", thisPerforation.color)
                    .attr("fill", configuration.perforationColor)
                    .attr("stroke", configuration.perforationColor)
                    .attr("value-index", currentIndex);

                // Setup tooltip
                this.#setupTooltip(polylineElem.node(), thisPerforation.row);

                // Perforations are not markable
            }
        }        
    }

    // Draws guns
    #drawGuns(svg, group, xScale, yScale) {
        const guns = group.guns;
        if(guns == null) return;

        const configuration = this.#configuration;
        const waypoints = group.waypoints;

        for(let currentIndex = 0; currentIndex < guns.length; currentIndex++) {
            const thisGun = guns[currentIndex];

            // Skip any plugs before first and beyond last waypoint
            if(thisGun.md < waypoints[0].md)
                continue;
            if(thisGun.md > waypoints[waypoints.length - 1].md)
                continue;

            // Calculate the points
            const pointsArr = this.#calculateGunPolygonPoints(thisGun.md, group, configuration.gunWidth);
            const points = this.#pointsArrToString(pointsArr, xScale, yScale);

            // Draw polyline
            const polylineElem = svg.append("polyline")
                .attr("class", "gun interactive")
                .attr("points", points.trim())
                //.attr("fill", thisGun.color)
                //.attr("stroke", thisGun.color)
                .attr("fill", configuration.gunColor)
                .attr("stroke", configuration.gunColor)
                .attr("value-index", currentIndex);

            // Setup tooltip
            this.#setupTooltip(polylineElem.node(), thisGun.row);

            // Guns are not markable
        }        
    }


    /* ---------------------------------------------------------------------------------------------------- */
    /* EVENTS */

    // Append event handlers for diagram clicks
    #appendEventHandlers(diagramElem) {
        const actions = this.#actions;

        // Call the clearAllMarking so marking across all trellis panels are cleared
        diagramElem.addEventListener('click', function(event) {
            actions.clearAllMarking();
        });
    } 

    // Setup tooltip action handlers
    #setupTooltip(elem, row) {
        const actions = this.#actions;

        // Append event handler for tooltip 
        if(actions.showTooltip != null) {
            elem.onmouseover = function(event) {
                event.stopPropagation();
                actions.showTooltip(row);
            }
        }

        if(actions.hideTooltip != null) {
            elem.onmouseout = function(event) {
                event.stopPropagation();
                actions.hideTooltip();
            }
        }
    }
    
    // Select fills and values based on rectangular selection area
    rectangleSelection(selection) {
        const diagramElem = this.#diagramElem;
        const group = this.#group;
        const scales = this.#scales;
        const xScale = scales.xScale;
        const yScale = scales.yScale;

        // Get the SVG element
        const svg = diagramElem.querySelector('svg');

        // Convert the selection rectangle coordinates
        const selectionBox = {
            x1: selection.x,
            x2: selection.x + selection.width,
            y1: selection.y,
            y2: selection.y + selection.height,
            offsetLeft: selection.offsetLeft,
            offsetTop: selection.offsetTop
        };

        // Determine if point is inside selection box
        function pointInSelectionBox(svgX, svgY) {
            const point = SVGUtility.svgToScreen(svg, svgX, svgY);
            return point.x >= selectionBox.x1 && point.x <= selectionBox.x2 && 
                point.y >= selectionBox.y1 && point.y <= selectionBox.y2;
        }

        // Initialize an array of selected objects
        const selectedArr = [];

        // Iterate all the polygons
        const polygons = group.polygons;
        for(let thisPolygon of polygons) {
            // Iterate all the points in the polygon
            for(let thisPoint of thisPolygon.points) {
                const svgX = xScale(thisPoint[0]) - selection.offsetLeft + WellboreDiagram.LEFT_MARGIN;
                const svgY = yScale(thisPoint[1]) - selection.offsetTop + WellboreDiagram.TOP_MARGIN;
                if(pointInSelectionBox(svgX, svgY) == true) {
                    selectedArr.push(thisPolygon.object.row);
                }
            }
        }

        return selectedArr;
    }

    /* ---------------------------------------------------------------------------------------------------- */
    /* ACCESSORS */

    // Sets the zoom range
    setZoomRange(zoomRange) {
        this.#zoomRange = zoomRange;
    }

}

