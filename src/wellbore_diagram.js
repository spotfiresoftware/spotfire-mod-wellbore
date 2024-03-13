/*
 * Copyright © 2024. Cloud Software Group, Inc.
 * This file is subject to the license terms contained
 * in the license file that is distributed with this file.
 */

class WellboreDiagram {

    constructor(canvasElem, actions) {
        this.canvasElem = canvasElem;
        this.actions = actions;
        this.initialDraw = false;
    }

    // Draw diagram
    draw(groupMap, configuration) {
        // Get the configuration
        this.configuration = configuration;

        // Get the canvas and clear contents
        let canvasElem = this.canvasElem;
        canvasElem.innerHTML = '';

        // Extract group data and set
        let group = groupMap[null];
        if(group == null) return;
        this.group = group;

        // Build the dataset
        let extents = this.buildData(group);

        // Create diagram and append
        let diagramElem = document.createElement('div');
        diagramElem.classList.add('wellbore-diagram');
        canvasElem.appendChild(diagramElem);

        // Set diagram element
        this.diagramElem = diagramElem;

        // Create SVG
        let svgElem = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        diagramElem.appendChild(svgElem);

        // Apply padding for scales
        extents.minX = extents.minX - configuration.scales.diagramLeftPadding;
        extents.maxY = extents.maxY + (extents.maxY - extents.minY) * 0.1;
        
        // Update viewbox for dimensions based on extents
        let viewBoxMinX = extents.minX;
        let viewBoxMinY = extents.minY;
        let viewBoxWidth = extents.maxX - extents.minX;
        let viewBoxHeight = extents.maxY - extents.minY;
        let viewBox = viewBoxMinX + ' ' + viewBoxMinY + ' ' + viewBoxWidth + ' ' + viewBoxHeight;
        svgElem.setAttribute('viewBox', viewBox);
        svgElem.setAttribute('preserveAspectRatio', 'xMidYMid meet');

        // Draw scale
        this.drawScale(svgElem, extents);

        // Draw borehole diagram
        this.drawDiagram(svgElem, group, extents);

        // Append event handlers
        this.appendEventHandlers(diagramElem);

        // Set markable class if marking enabled
        if(this.configuration.marking != null) {
            diagramElem.classList.add('markable');
        }
        else {
            diagramElem.classList.remove('markable');
        }
    }

    /* ---------------------------------------------------------------------------------------------------- */
    /* CALCULATIONS */

    // Build data for rendering
    buildData(group) {
        // Make a function sort by MD
        let mdSort = function(a, b) {
            return a.md - b.md;
        };

        // Sort waypoints and values by MD
        group.waypoints.sort(mdSort);
        group.values.sort(mdSort);

        // Create array to hold polygons
        group.polygons = [];

        // Calculate borehole
        let extents = this.calculateBorehole(group);

        return extents;
    }
    
    // Calculate borehole
    calculateBorehole(group) {
        // Extract waypoints
        let waypoints = group.waypoints;
        if(waypoints == null || waypoints.length == 0) return;

        // Initialize extents
        let extents = {
            minX: Number.MAX_SAFE_INTEGER,
            maxX: Number.MIN_SAFE_INTEGER,
            minY: Number.MAX_SAFE_INTEGER,
            maxY: Number.MIN_SAFE_INTEGER
        };

        // Setup first waypoint center reference
        let firstWaypoint = waypoints[0];
        firstWaypoint.centerX = 0;
        firstWaypoint.centerY = Math.abs(firstWaypoint.tvd);

        // Loop over trajectory waypoints and calculate angles and centers
        for(let currentIndex = 0; currentIndex < waypoints.length; currentIndex++) {
            let thisWaypoint = waypoints[currentIndex];
            let nextWaypoint = waypoints[currentIndex + 1];
            let prevWaypoint = waypoints[currentIndex - 1];
            
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
            let thisWaypoint = waypoints[currentIndex];
            let nextWaypoint = waypoints[currentIndex + 1];
            if(nextWaypoint == null) break;

            let boreholeRight = {};
            let boreholeLeft = {};
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
        this.correctOverlaps(group.borehole.right);
        this.correctOverlaps(group.borehole.left);

        return extents;
    }

    // Correct overlaps on borehole walls
    correctOverlaps(waypoints) {
        for(let currentIndex = 0; currentIndex < waypoints.length; currentIndex++) {
            let thisWaypoint = waypoints[currentIndex];
            let nextWaypoint = waypoints[currentIndex + 1];

            // Calculate MD
            if(currentIndex > 0) {
                let prevWaypoint = waypoints[currentIndex - 1];
                thisWaypoint.segLen = Math.sqrt(Math.pow(thisWaypoint.startX - thisWaypoint.endX, 2) + Math.pow(thisWaypoint.startY - thisWaypoint.endY, 2));
                thisWaypoint.md = prevWaypoint.md + thisWaypoint.segLen;
            }

            if(nextWaypoint == null) break;

            // If start and end do not match, then find the intersection
            if(Math.abs(thisWaypoint.endX - nextWaypoint.startX) > 0.1 || Math.abs(thisWaypoint.endY - nextWaypoint.startY) > 0.1) {
                // Find the intersection of this and next waypoints
                let intersection = this.intersect(thisWaypoint.startX, thisWaypoint.startY, thisWaypoint.endX, thisWaypoint.endY, 
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

    // Calculate perforation polygons
    calculatePerfPolygonPoints(leadingMD, midMD, trailingMD, perfLength, waypoints, extents) {
        // Match leading MD
        let leadingMatchObj = this.matchWaypoint(waypoints, leadingMD);
        let leadingMatchWaypoint = leadingMatchObj.waypoint;

        let thisPerfLength = leadingMatchWaypoint.diameter / 2 + perfLength;
       

        // Calculate leading MD center
        let leadingCenterX = leadingMatchWaypoint.centerX + (leadingMD - leadingMatchWaypoint.md) * Math.cos(leadingMatchWaypoint.a1);
        let leadingCenterY = leadingMatchWaypoint.centerY + (leadingMD - leadingMatchWaypoint.md) * Math.sin(leadingMatchWaypoint.a1);

        // Calculate leading MD to right borehole segment (diameter to compute intersection)
        let leadingRightX = leadingCenterX + leadingMatchWaypoint.diameter * Math.cos(leadingMatchWaypoint.a2);
        let leadingRightY = leadingCenterY - leadingMatchWaypoint.diameter * Math.sin(leadingMatchWaypoint.a2);

        // Calculate leading right intersection
        let leadingRightIntersect = this.intersect(leadingCenterX, leadingCenterY, leadingRightX, leadingRightY,
            leadingMatchWaypoint.boreholeRight.startX, leadingMatchWaypoint.boreholeRight.startY, 
            leadingMatchWaypoint.boreholeRight.endX, leadingMatchWaypoint.boreholeRight.endY); 

        // Calculate leading MD to left borehole segment (diameter to compute intersection)
        let leadingLeftX = leadingCenterX - thisPerfLength * Math.cos(leadingMatchWaypoint.a2);
        let leadingLeftY = leadingCenterY + thisPerfLength * Math.sin(leadingMatchWaypoint.a2);

        // Calculate leading left intersection
        let leadingLeftIntersect = this.intersect(leadingCenterX, leadingCenterY, leadingLeftX, leadingLeftY,
            leadingMatchWaypoint.boreholeLeft.startX, leadingMatchWaypoint.boreholeLeft.startY, 
            leadingMatchWaypoint.boreholeLeft.endX, leadingMatchWaypoint.boreholeLeft.endY); 


        // Match mid MD
        let midMatchObj = this.matchWaypoint(waypoints, midMD);
        let midMatchWaypoint = midMatchObj.waypoint;

        // Calculate mid MD center
        let midCenterX = midMatchWaypoint.centerX + (midMD - midMatchWaypoint.md) * Math.cos(midMatchWaypoint.a1);
        let midCenterY = midMatchWaypoint.centerY + (midMD - midMatchWaypoint.md) * Math.sin(midMatchWaypoint.a1);

        // Calculate mid MD to right apex (thisPerfLength to compute intersection)
        let midRightX = midCenterX + thisPerfLength * Math.cos(midMatchWaypoint.a2);
        let midRightY = midCenterY - thisPerfLength * Math.sin(midMatchWaypoint.a2);

        extents.minY = Math.min(extents.minY, midRightY);

        // Calculate mid MD to left apex (thisPerfLength to compute intersection)
        let midLeftX = midCenterX - thisPerfLength * Math.cos(midMatchWaypoint.a2);
        let midLeftY = midCenterY + thisPerfLength * Math.sin(midMatchWaypoint.a2);

        extents.maxY = Math.max(extents.maxY, midLeftY);


        // Match trailing MD
        let trailingMatchObj = this.matchWaypoint(waypoints, trailingMD);
        let trailingMatchWaypoint = trailingMatchObj.waypoint;

        // Calculate trailing MD center
        let trailingCenterX = trailingMatchWaypoint.centerX + (trailingMD - trailingMatchWaypoint.md) * Math.cos(trailingMatchWaypoint.a1);
        let trailingCenterY = trailingMatchWaypoint.centerY + (trailingMD - trailingMatchWaypoint.md) * Math.sin(trailingMatchWaypoint.a1);

        // Calculate trailing MD to left borehole segment (diameter to compute intersection)
        let trailingLeftX = trailingCenterX - trailingMatchWaypoint.diameter * Math.cos(trailingMatchWaypoint.a2);
        let trailingLeftY = trailingCenterY + trailingMatchWaypoint.diameter * Math.sin(trailingMatchWaypoint.a2);

        // Calculate trailing left intersection
        let trailingLeftIntersect = this.intersect(trailingCenterX, trailingCenterY, trailingLeftX, trailingLeftY,
            trailingMatchWaypoint.boreholeLeft.startX, trailingMatchWaypoint.boreholeLeft.startY, 
            trailingMatchWaypoint.boreholeLeft.endX, trailingMatchWaypoint.boreholeLeft.endY); 
        
        // Calculate trailing MD to right borehole segment (diameter to compute intersection)
        let trailingRightX = trailingCenterX + trailingMatchWaypoint.diameter * Math.cos(trailingMatchWaypoint.a2);
        let trailingRightY = trailingCenterY - trailingMatchWaypoint.diameter * Math.sin(trailingMatchWaypoint.a2);

        // Calculate trailing right intersection
        let trailingRightIntersect = this.intersect(trailingCenterX, trailingCenterY, trailingRightX, trailingRightY,
            trailingMatchWaypoint.boreholeRight.startX, trailingMatchWaypoint.boreholeRight.startY, 
            trailingMatchWaypoint.boreholeRight.endX, trailingMatchWaypoint.boreholeRight.endY); 

        // RIGHT POINTS
        // Setup rightPoints attribute
        let rightPointsArr = [];

        // Leading right point
        if(leadingRightIntersect != null && leadingRightIntersect != false) {
            rightPointsArr.push([leadingRightIntersect.x, leadingRightIntersect.y]);
        }
        else {
            let dEnd = Math.sqrt(Math.pow(leadingRightX - leadingMatchWaypoint.boreholeRight.endX, 2) + Math.pow(leadingRightY - leadingMatchWaypoint.boreholeRight.endY, 2))
            let dStart = Math.sqrt(Math.pow(leadingRightX - leadingMatchWaypoint.boreholeRight.startX, 2) + Math.pow(leadingRightY - leadingMatchWaypoint.boreholeRight.startY, 2))
            if(dEnd < dStart) {
                rightPointsArr.push([leadingMatchWaypoint.boreholeRight.endX, leadingMatchWaypoint.boreholeRight.endY]);
            }
            else {
                rightPointsArr.push([leadingMatchWaypoint.boreholeRight.startX, leadingMatchWaypoint.boreholeRight.startY]);
            }
        }

        // Mid right apex
        rightPointsArr.push([midRightX, midRightY]);

        // Trailing right point
        if(trailingRightIntersect != null && trailingRightIntersect != false) {
            rightPointsArr.push([trailingRightIntersect.x, trailingRightIntersect.y]);
        }
        else {
            let dEnd = Math.sqrt(Math.pow(trailingRightX - trailingMatchWaypoint.boreholeRight.endX, 2) + Math.pow(trailingRightY - trailingMatchWaypoint.boreholeRight.endY, 2))
            let dStart = Math.sqrt(Math.pow(trailingRightX - trailingMatchWaypoint.boreholeRight.startX, 2) + Math.pow(trailingRightY - trailingMatchWaypoint.boreholeRight.startY, 2))
            if(dEnd < dStart) {
                rightPointsArr.push([trailingMatchWaypoint.boreholeRight.endX, trailingMatchWaypoint.boreholeRight.endY]);
            }
            else {
                rightPointsArr.push([trailingMatchWaypoint.boreholeRight.startX, trailingMatchWaypoint.boreholeRight.startY]);
            }
        }

        // Leading right point (again, this is needed to close the polygon properly)
        if(leadingRightIntersect != null && leadingRightIntersect != false) {
            rightPointsArr.push([leadingRightIntersect.x, leadingRightIntersect.y]);
        }
        else {
            let dEnd = Math.sqrt(Math.pow(leadingRightX - leadingMatchWaypoint.boreholeRight.endX, 2) + Math.pow(leadingRightY - leadingMatchWaypoint.boreholeRight.endY, 2))
            let dStart = Math.sqrt(Math.pow(leadingRightX - leadingMatchWaypoint.boreholeRight.startX, 2) + Math.pow(leadingRightY - leadingMatchWaypoint.boreholeRight.startY, 2))
            if(dEnd < dStart) {
                rightPointsArr.push([leadingMatchWaypoint.boreholeRight.endX, leadingMatchWaypoint.boreholeRight.endY]);
            }
            else {
                rightPointsArr.push([leadingMatchWaypoint.boreholeRight.startX, leadingMatchWaypoint.boreholeRight.startY]);
            }
        }


        // LEFT POINTS
        // Setup leftPoints attribute
        let leftPointsArr = [];

        // Leading left point
        if(leadingLeftIntersect != null && leadingLeftIntersect != false) {
            leftPointsArr.push([leadingLeftIntersect.x, leadingLeftIntersect.y]);
        }
        else {
            let dEnd = Math.sqrt(Math.pow(leadingLeftX - leadingMatchWaypoint.boreholeLeft.endX, 2) + Math.pow(leadingLeftY - leadingMatchWaypoint.boreholeLeft.endY, 2))
            let dStart = Math.sqrt(Math.pow(leadingLeftX - leadingMatchWaypoint.boreholeLeft.startX, 2) + Math.pow(leadingLeftY - leadingMatchWaypoint.boreholeLeft.startY, 2))
            if(dEnd < dStart) {
                leftPointsArr.push([leadingMatchWaypoint.boreholeLeft.endX, leadingMatchWaypoint.boreholeLeft.endY]);
            }
            else {
                leftPointsArr.push([leadingMatchWaypoint.boreholeLeft.startX, leadingMatchWaypoint.boreholeLeft.startY]);
            }
        }

        // Mid left apex
        leftPointsArr.push([midLeftX, midLeftY]);

        // Trailing left point
        if(trailingLeftIntersect != null && trailingLeftIntersect != false) {
            leftPointsArr.push([trailingLeftIntersect.x, trailingLeftIntersect.y]);
        }
        else {
            let dEnd = Math.sqrt(Math.pow(trailingLeftX - trailingMatchWaypoint.boreholeLeft.endX, 2) + Math.pow(trailingLeftY - trailingMatchWaypoint.boreholeLeft.endY, 2))
            let dStart = Math.sqrt(Math.pow(trailingLeftX - trailingMatchWaypoint.boreholeLeft.startX, 2) + Math.pow(trailingLeftY - trailingMatchWaypoint.boreholeLeft.startY, 2))
            if(dEnd < dStart) {
                leftPointsArr.push([trailingMatchWaypoint.boreholeLeft.endX, trailingMatchWaypoint.boreholeLeft.endY]);
            }
            else {
                leftPointsArr.push([trailingMatchWaypoint.boreholeLeft.startX, trailingMatchWaypoint.boreholeLeft.startY]);
            }
        }

        // Leading left point (again, this is needed to close the polygon properly)
        if(leadingLeftIntersect != null && leadingLeftIntersect != false) {
            leftPointsArr.push([leadingLeftIntersect.x, leadingLeftIntersect.y]);
        }
        else {
            let dEnd = Math.sqrt(Math.pow(leadingLeftX - leadingMatchWaypoint.boreholeLeft.endX, 2) + Math.pow(leadingLeftY - leadingMatchWaypoint.boreholeLeft.endY, 2))
            let dStart = Math.sqrt(Math.pow(leadingLeftX - leadingMatchWaypoint.boreholeLeft.startX, 2) + Math.pow(leadingLeftY - leadingMatchWaypoint.boreholeLeft.startY, 2))
            if(dEnd < dStart) {
                leftPointsArr.push([leadingMatchWaypoint.boreholeLeft.endX, leadingMatchWaypoint.boreholeLeft.endY]);
            }
            else {
                leftPointsArr.push([leadingMatchWaypoint.boreholeLeft.startX, leadingMatchWaypoint.boreholeLeft.startY]);
            }
        }

        let returnArr = [];
        if(this.configuration.perforationRight == true)
            returnArr.push(rightPointsArr);
        if(this.configuration.perforationLeft == true)
            returnArr.push(leftPointsArr);

        return returnArr;
    }

    // Calculate fill polygons
    calculateFillPolygonPoints(leadingMD, trailingMD, group) {
        let waypoints = group.waypoints;

        // Match leading MD
        let leadingMatchObj = this.matchWaypoint(waypoints, leadingMD);
        let leadingMatchWaypoint = leadingMatchObj.waypoint;

        // Calculate leading MD center
        let leadingCenterX = leadingMatchWaypoint.centerX + (leadingMD - leadingMatchWaypoint.md) * Math.cos(leadingMatchWaypoint.a1);
        let leadingCenterY = leadingMatchWaypoint.centerY + (leadingMD - leadingMatchWaypoint.md) * Math.sin(leadingMatchWaypoint.a1);

        // Calculate leading MD to right borehole segment (diameter to compute intersection)
        let leadingRightX = leadingCenterX + leadingMatchWaypoint.diameter * Math.cos(leadingMatchWaypoint.a2);
        let leadingRightY = leadingCenterY - leadingMatchWaypoint.diameter * Math.sin(leadingMatchWaypoint.a2);

        // Calculate leading right intersection
        let leadingRightIntersect = this.intersect(leadingCenterX, leadingCenterY, leadingRightX, leadingRightY,
            leadingMatchWaypoint.boreholeRight.startX, leadingMatchWaypoint.boreholeRight.startY, 
            leadingMatchWaypoint.boreholeRight.endX, leadingMatchWaypoint.boreholeRight.endY); 

        // Calculate leading MD to left borehole segment (diameter to compute intersection)
        let leadingLeftX = leadingCenterX - leadingMatchWaypoint.diameter * Math.cos(leadingMatchWaypoint.a2);
        let leadingLeftY = leadingCenterY + leadingMatchWaypoint.diameter * Math.sin(leadingMatchWaypoint.a2);

        // Calculate leading left intersection
        let leadingLeftIntersect = this.intersect(leadingCenterX, leadingCenterY, leadingLeftX, leadingLeftY,
            leadingMatchWaypoint.boreholeLeft.startX, leadingMatchWaypoint.boreholeLeft.startY, 
            leadingMatchWaypoint.boreholeLeft.endX, leadingMatchWaypoint.boreholeLeft.endY); 



        // Match trailing MD
        let trailingMatchObj = this.matchWaypoint(waypoints, trailingMD);
        let trailingMatchWaypoint = trailingMatchObj.waypoint;

        // Calculate trailing MD center
        let trailingCenterX = trailingMatchWaypoint.centerX + (trailingMD - trailingMatchWaypoint.md) * Math.cos(trailingMatchWaypoint.a1);
        let trailingCenterY = trailingMatchWaypoint.centerY + (trailingMD - trailingMatchWaypoint.md) * Math.sin(trailingMatchWaypoint.a1);

        // Calculate trailing MD to left borehole segment (diameter to compute intersection)
        let trailingLeftX = trailingCenterX - trailingMatchWaypoint.diameter * Math.cos(trailingMatchWaypoint.a2);
        let trailingLeftY = trailingCenterY + trailingMatchWaypoint.diameter * Math.sin(trailingMatchWaypoint.a2);

        // Calculate trailing left intersection
        let trailingLeftIntersect = this.intersect(trailingCenterX, trailingCenterY, trailingLeftX, trailingLeftY,
            trailingMatchWaypoint.boreholeLeft.startX, trailingMatchWaypoint.boreholeLeft.startY, 
            trailingMatchWaypoint.boreholeLeft.endX, trailingMatchWaypoint.boreholeLeft.endY); 
        
        // Calculate trailing MD to right borehole segment (diameter to compute intersection)
        let trailingRightX = trailingCenterX + trailingMatchWaypoint.diameter * Math.cos(trailingMatchWaypoint.a2);
        let trailingRightY = trailingCenterY - trailingMatchWaypoint.diameter * Math.sin(trailingMatchWaypoint.a2);

        // Calculate trailing right intersection
        let trailingRightIntersect = this.intersect(trailingCenterX, trailingCenterY, trailingRightX, trailingRightY,
            trailingMatchWaypoint.boreholeRight.startX, trailingMatchWaypoint.boreholeRight.startY, 
            trailingMatchWaypoint.boreholeRight.endX, trailingMatchWaypoint.boreholeRight.endY); 

        // Setup points array
        let pointsArr = [];

        // Leading right point
        if(leadingRightIntersect != null && leadingRightIntersect != false) {
            pointsArr.push([leadingRightIntersect.x, leadingRightIntersect.y]);           
        }
        else {
            let dEnd = Math.sqrt(Math.pow(leadingRightX - leadingMatchWaypoint.boreholeRight.endX, 2) + Math.pow(leadingRightY - leadingMatchWaypoint.boreholeRight.endY, 2))
            let dStart = Math.sqrt(Math.pow(leadingRightX - leadingMatchWaypoint.boreholeRight.startX, 2) + Math.pow(leadingRightY - leadingMatchWaypoint.boreholeRight.startY, 2))
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
            let dEnd = Math.sqrt(Math.pow(leadingLeftX - leadingMatchWaypoint.boreholeLeft.endX, 2) + Math.pow(leadingLeftY - leadingMatchWaypoint.boreholeLeft.endY, 2))
            let dStart = Math.sqrt(Math.pow(leadingLeftX - leadingMatchWaypoint.boreholeLeft.startX, 2) + Math.pow(leadingLeftY - leadingMatchWaypoint.boreholeLeft.startY, 2))
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
                let thisWaypoint = waypoints[idx];
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
            let dEnd = Math.sqrt(Math.pow(trailingLeftX - trailingMatchWaypoint.boreholeLeft.endX, 2) + Math.pow(trailingLeftY - trailingMatchWaypoint.boreholeLeft.endY, 2))
            let dStart = Math.sqrt(Math.pow(trailingLeftX - trailingMatchWaypoint.boreholeLeft.startX, 2) + Math.pow(trailingLeftY - trailingMatchWaypoint.boreholeLeft.startY, 2))
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
            let dEnd = Math.sqrt(Math.pow(trailingRightX - trailingMatchWaypoint.boreholeRight.endX, 2) + Math.pow(trailingRightY - trailingMatchWaypoint.boreholeRight.endY, 2))
            let dStart = Math.sqrt(Math.pow(trailingRightX - trailingMatchWaypoint.boreholeRight.startX, 2) + Math.pow(trailingRightY - trailingMatchWaypoint.boreholeRight.startY, 2))
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
            for(let idx = trailingMatchObj.index + 1; idx < leadingMatchObj.index - 1; idx++) {
                let thisWaypoint = waypoints[idx];
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
            let dEnd = Math.sqrt(Math.pow(leadingRightX - leadingMatchWaypoint.boreholeRight.endX, 2) + Math.pow(leadingRightY - leadingMatchWaypoint.boreholeRight.endY, 2))
            let dStart = Math.sqrt(Math.pow(leadingRightX - leadingMatchWaypoint.boreholeRight.startX, 2) + Math.pow(leadingRightY - leadingMatchWaypoint.boreholeRight.startY, 2))
            if(dEnd < dStart) {
                pointsArr.push([leadingMatchWaypoint.boreholeRight.endX, leadingMatchWaypoint.boreholeRight.endY]);           
            }
            else {
                pointsArr.push([leadingMatchWaypoint.boreholeRight.startX, leadingMatchWaypoint.boreholeRight.startY]);           
            }
        }

        return pointsArr;
    }

    // Match a waypoint for a given MD, for fill and value polygons
    matchWaypoint(waypoints, md) {
        // Identify waypoints
        let matchWaypoint = null;
        let index = null;

        for(let idx = 0; idx < waypoints.length; idx++) {
            let thisWaypoint = waypoints[idx];
            if(thisWaypoint.md >= md) {
                matchWaypoint = thisWaypoint;
                index = idx;
                break;
            }
        }

        if(matchWaypoint.md == md) {
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

    // Calculate the intersection point of two line segments
    // Used to correct overlaps and set fill polygons
    intersect(x1, y1, x2, y2, x3, y3, x4, y4) {
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

        let denominator = ((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1))

        // Lines are parallel
        if (denominator === 0) {
            return false
        }

        let ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denominator
        let ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denominator

        // is the intersection along the segments
        if (ua < 0 || ua > 1 || ub < 0 || ub > 1) {
            return false
        }

        // Return a object with the x and y coordinates of the intersection
        let x = x1 + ua * (x2 - x1)
        let y = y1 + ua * (y2 - y1)

        return {x, y}        
    }


    /* ---------------------------------------------------------------------------------------------------- */
    /* POLYLINE HELPERS */

    // Extracts centerline points and creates an array
    getCenterLinePoints(waypoints) {
        let points = '';
        for(let thisWaypoint of waypoints) {
            points += thisWaypoint.centerX + ',' + thisWaypoint.centerY + ' ';
        }
        return points.trim();
    }

    // Extracts borehole wall waypoints and creates an array
    getBoreholeLinePoints(waypoints) {
        let points = '';
        for(let currentIndex = 0; currentIndex < waypoints.length; currentIndex++) {
            let thisWaypoint = waypoints[currentIndex];
            points += thisWaypoint.startX + ',' + thisWaypoint.startY + ' ';
            points += thisWaypoint.endX + ',' + thisWaypoint.endY + ' ';
        }

        return points.trim();
    }

    // Converts an array of points in x,y format into a string for use with polyline
    pointsArrToString(pointsArr) {
        let points = '';
        for(let idx = 0; idx < pointsArr.length; idx++) {
            points += pointsArr[idx][0] + ',' + pointsArr[idx][1] + ' ';
        }
        return points;
    }


    /* ---------------------------------------------------------------------------------------------------- */
    /* DRAW COMPONENTS */

    // Draw scale
    drawScale(svgElem, extents) {
        let configuration = this.configuration;
        if(configuration.scales.tvdScaleDisplay == false) return;

        let diagramElem = this.diagramElem;

        // Create a group element
        let scaleGroupElem = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        scaleGroupElem.classList.add('scale');
        scaleGroupElem.classList.add('scale-y');
        svgElem.appendChild(scaleGroupElem);

        // Calculate extents deltas
        let dx = extents.maxX - extents.minX;
        let dy = extents.maxY - extents.minY;

        // Calculate X position for scale axis line
        let scalePosX = extents.minX + configuration.scales.tvdScaleOffset;
        
        // Create a scale axis line on left edge
        let scaleLineElem = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        scaleLineElem.classList.add('scale-line');
        scaleLineElem.setAttribute('x1', scalePosX );
        scaleLineElem.setAttribute('y1', extents.minY);
        scaleLineElem.setAttribute('x2', scalePosX);
        scaleLineElem.setAttribute('y2', extents.maxY);
        scaleLineElem.setAttribute('vector-effect', 'non-scaling-stroke');
        scaleGroupElem.appendChild(scaleLineElem);

        // Calculate number of ticks and intervals determined by min separation in pixels from axis
        let minSeparation = 80;
        let tickCount = Math.round(scaleLineElem.getBoundingClientRect().height / minSeparation);
        let tickInterval = Math.round(dy / tickCount);

        // Identify the most appropriate divisor to setup scale values
        let divisors = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000, 2000000, 5000000];
        let divisor = null;
        for(let idx = 1; idx < divisors.length; idx++) {
            if(tickInterval / divisors[idx] < 1) {
                divisor = divisors[idx - 1];
                break;
            }
        }

        // Get the scale tick interval by rounding to the nearest appropriate divisor
        let scaleTickInterval = Math.round(tickInterval / divisor) * divisor;

        // Set first tick value
        let firstTickVal = Math.ceil(extents.minY / scaleTickInterval) * scaleTickInterval;
        let ticks = 0;

        // Start creating ticks from firstTickVal, and keep making a tick every interval
        //   until the max is hit or exceeded
        for(let tickVal = firstTickVal; tickVal <= extents.maxY;) {
            // Create tick line
            let scaleTickLineElem = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            scaleTickLineElem.classList.add('scale-line-tick');
            scaleTickLineElem.setAttribute('x1', scalePosX - 25);
            scaleTickLineElem.setAttribute('y1', tickVal);
            scaleTickLineElem.setAttribute('x2', scalePosX);
            scaleTickLineElem.setAttribute('y2', tickVal);
            scaleTickLineElem.setAttribute('vector-effect', 'non-scaling-stroke');
            scaleGroupElem.appendChild(scaleTickLineElem);
    
            // SVG text gets distorted when scaling the diagram, so using div instead
            /*// Calculate font size
            let fontSize = Math.round(configuration.scales.tvdScaleFontSize * (extents.maxX - extents.minX) / svgElem.getBoundingClientRect().width);

            // Create tick text
            let scaleTickTextElem = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            scaleTickTextElem.classList.add('scale-line-text');
            scaleTickTextElem.textContent = tickVal;
            scaleTickTextElem.setAttribute('x', scalePosX - 50);
            scaleTickTextElem.setAttribute('y', tickVal);
            scaleTickTextElem.style.fontSize = fontSize + 'px';
            scaleTickTextElem.setAttribute('vector-effect', 'non-scaling-stroke');
            scaleGroupElem.appendChild(scaleTickTextElem);*/

            // Create tick text using div method (no distortion on scaling)
            let scaleTickTextElem = document.createElement('div');
            scaleTickTextElem.classList.add('scale-line-text');
            scaleTickTextElem.innerHTML = tickVal;
            diagramElem.appendChild(scaleTickTextElem);

            let textPosition = Utility.svgToScreen(svgElem, scalePosX - 25, tickVal);            
            scaleTickTextElem.style.left = textPosition.x - (scaleTickTextElem.getBoundingClientRect().width) + 'px';
            scaleTickTextElem.style.top = textPosition.y - (scaleTickTextElem.getBoundingClientRect().height) / 2 + 'px';

            // Create tick grid line if enabled
            if(configuration.scales.tvdScaleGridDisplay == true && ticks % 1 == 0) {
                let scaleTickGridLineElem = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                scaleTickGridLineElem.classList.add('scale-line-grid');
                scaleTickGridLineElem.setAttribute('x1', scalePosX);
                scaleTickGridLineElem.setAttribute('y1', tickVal);
                scaleTickGridLineElem.setAttribute('x2', extents.maxX);
                scaleTickGridLineElem.setAttribute('y2', tickVal);
                scaleTickGridLineElem.setAttribute('vector-effect', 'non-scaling-stroke');
                scaleGroupElem.appendChild(scaleTickGridLineElem);
            }

            // Increment the tick value
            tickVal = tickVal + scaleTickInterval;
            ticks++;
        }
    }

    // Draw diagram 
    drawDiagram(svgElem, group, extents) {
        let diagramGroupElem = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        diagramGroupElem.classList.add('diagram');
        svgElem.appendChild(diagramGroupElem);

        // Draw borehole
        this.drawBorehole(diagramGroupElem, group);

        // Draw values
        this.drawValues(diagramGroupElem, group);

        // Draw fills
        this.drawFills(diagramGroupElem, group);

        // Draw plugs
        this.drawPlugs(diagramGroupElem, group);

        // Draw perforations
        this.drawPerforations(diagramGroupElem, group, extents);
    }

    // Draws borehole walls
    drawBorehole(diagramGroupElem, group) {
        // Draw centerline
        let centerLineElem = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        centerLineElem.classList.add('centerline');
        centerLineElem.setAttribute('points', this.getCenterLinePoints(group.waypoints));
        centerLineElem.setAttribute('vector-effect', 'non-scaling-stroke');
        diagramGroupElem.appendChild(centerLineElem);

        // Draw borehole left
        let boreLineLeftElem = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        boreLineLeftElem.classList.add('boreline');
        boreLineLeftElem.setAttribute('points', this.getBoreholeLinePoints(group.borehole.left));
        boreLineLeftElem.setAttribute('vector-effect', 'non-scaling-stroke');
        diagramGroupElem.appendChild(boreLineLeftElem);

        // Draw borehole right
        let boreLineRightElem = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        boreLineRightElem.classList.add('boreline');
        boreLineRightElem.setAttribute('points', this.getBoreholeLinePoints(group.borehole.right));
        boreLineRightElem.setAttribute('vector-effect', 'non-scaling-stroke');
        diagramGroupElem.appendChild(boreLineRightElem);
    }

    // Draws value polygons
    drawValues(diagramGroupElem, group) {
        let values = group.values;
        if(values == null) return;

        let waypoints = group.waypoints;

        for(let currentIndex = 0; currentIndex < values.length; currentIndex++) {
            let thisValue = values[currentIndex];

            let overlap = 5;

            // Calculate leading and trailing MD interval
            let prevValue = values[currentIndex - 1];
            let trailingMD = thisValue.md - (thisValue.md - (prevValue != null ? prevValue.md : thisValue.md)) / 2 - overlap;

            let nextValue = values[currentIndex + 1];
            let leadingMD = thisValue.md + ((nextValue != null ? nextValue.md : thisValue.md) - thisValue.md) / 2 + overlap;
        
            // Skip any values before first and beyond last waypoint
            if(trailingMD < waypoints[0].md)
                continue;
            if(leadingMD > waypoints[waypoints.length - 1].md)
                continue;

            // Calculate the points
            let pointsArr = this.calculateFillPolygonPoints(leadingMD, trailingMD, group);
            let points = this.pointsArrToString(pointsArr);

            // Draw polyline
            let polylineElem = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            polylineElem.classList.add('value');
            polylineElem.classList.add('selectable');
            polylineElem.setAttribute('points', points.trim());
            polylineElem.setAttribute('fill', thisValue.color);
            polylineElem.setAttribute('stroke', thisValue.color);
            polylineElem.setAttribute('value-index', currentIndex);
            diagramGroupElem.appendChild(polylineElem);

            // Push into the polygon array
            group.polygons.push({
                points: pointsArr,
                object: thisValue,
                type: 'value'
            });

            // Setup tooltip
            this.setupTooltip(polylineElem, thisValue.row);

            // Append event handler for marking if enabled
            if(this.configuration.marking != null) {
                polylineElem.onclick = function(event) {
                    event.stopPropagation();
                    if(event.ctrlKey == true)
                        thisValue.row.mark("Toggle");
                    else
                        thisValue.row.mark("Replace");
                }
            }
        }

    }

    // Draws plugs
    drawPlugs(diagramGroupElem, group) {
        let plugs = group.plugs;
        if(plugs == null) return;

        let configuration = this.configuration;
        let waypoints = group.waypoints;

        for(let currentIndex = 0; currentIndex < plugs.length; currentIndex++) {
            let thisPlug = plugs[currentIndex];

            // Get configuration
            let plugSize = configuration.plugWidth;

            // Calculate leading and trailing MD interval
            let trailingMD = thisPlug.md - plugSize;
            let leadingMD = thisPlug.md + plugSize;

            // Skip any plugs before first and beyond last waypoint
            if(trailingMD < waypoints[0].md)
                continue;
            if(leadingMD > waypoints[waypoints.length - 1].md)
                continue;

            // Calculate the points
            let pointsArr = this.calculateFillPolygonPoints(leadingMD, trailingMD, group);
            let points = this.pointsArrToString(pointsArr);

            // Draw polyline
            let polylineElem = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            polylineElem.classList.add('plug');
            polylineElem.setAttribute('points', points.trim());
            polylineElem.setAttribute('value-index', currentIndex);
            //polylineElem.setAttribute('stroke', thisPlug.color);
            //polylineElem.setAttribute('fill', thisPlug.color);
            diagramGroupElem.appendChild(polylineElem);
        }        
    }

    // Draws perforations
    drawPerforations(diagramGroupElem, group, extents) {
        let perforations = group.perforations;
        if(perforations == null) return;

        let waypoints = group.waypoints;

        for(let currentIndex = 0; currentIndex < perforations.length; currentIndex++) {
            let thisPerforation = perforations[currentIndex];

            // Get configuration
            let wallDelta = this.configuration.perforationBaseWidth;
            let perfLength = this.configuration.perforationLength;

            // Calculate leading and trailing
            let leadingMD = thisPerforation.md + wallDelta;
            let trailingMD = thisPerforation.md - wallDelta;

            // Skip any perforations before first and beyond last waypoint
            if(trailingMD < waypoints[0].md)
                continue;
            if(leadingMD > waypoints[waypoints.length - 1].md)
                continue;

            // Calculate polygon points
            let pointsArrList = this.calculatePerfPolygonPoints(leadingMD, thisPerforation.md, trailingMD, perfLength, waypoints, extents);

            for(let thisPointsArr of pointsArrList) {
                let points = this.pointsArrToString(thisPointsArr);

                // Draw polyline
                let polylineElem = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                polylineElem.classList.add('perforation');
                polylineElem.setAttribute('points', points.trim());
                polylineElem.setAttribute('value-index', currentIndex);
                //polylineElem.setAttribute('stroke', thisPerforation.color);
                //polylineElem.setAttribute('fill', thisPerforation.color);
                diagramGroupElem.appendChild(polylineElem);
            }

        }        
    }

    // Draws fills
    drawFills(diagramGroupElem, group) {
        let fills = group.fills;
        if(fills == null) return;

        let waypoints = group.waypoints;

        for(let currentIndex = 0; currentIndex < fills.length; currentIndex++) {
            let thisFill = fills[currentIndex];

            // Calculate leading and trailing MD interval
            let trailingMD = waypoints[0].md;
            let leadingMD = thisFill.md;
        
            // Skip any values before first and beyond last waypoint
            if(trailingMD < waypoints[0].md)
                continue;
            if(leadingMD > waypoints[waypoints.length - 1].md)
                continue;

            // Calculate the points
            let pointsArr = this.calculateFillPolygonPoints(leadingMD, trailingMD, group);
            let points = this.pointsArrToString(pointsArr);

            // Draw polyline
            let polylineElem = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            polylineElem.classList.add('fill');
            polylineElem.classList.add('selectable');
            polylineElem.setAttribute('points', points.trim());
            polylineElem.setAttribute('fill', thisFill.color);
            polylineElem.setAttribute('stroke', thisFill.color);
            polylineElem.setAttribute('value-index', currentIndex);
            diagramGroupElem.appendChild(polylineElem);

            // Push into the polygon array
            group.polygons.push({
                points: pointsArr,
                object: thisFill,
                type: 'fill'
            });

            // Setup tooltip
            this.setupTooltip(polylineElem, thisFill.row);

            // Append event handler for marking if enabled
            if(this.configuration.marking != null) {
                polylineElem.onclick = function(event) {
                    event.stopPropagation();
                    if(event.ctrlKey == true)
                        thisFill.row.mark("Toggle");
                    else
                        thisFill.row.mark("Replace");
                }
            }

        }

    }

    /* ---------------------------------------------------------------------------------------------------- */
    /* EVENTS */

    // Append event handlers for plot area clicks
    appendEventHandlers(plotAreaElem) {
        let self = this;
        plotAreaElem.onclick = function(event) {
            // Call the clearAllMarking so marking across all trellis panels are cleared
            self.actions.clearAllMarking();
        };
    } 

    // Setup tooltip action handlers
    setupTooltip(elem, row) {
        // Append event handler for tooltip 
        if(this.actions.showTooltip != null) {
            let self = this;
            elem.onmouseover = function(event) {
                event.stopPropagation();
                self.actions.showTooltip(row);
            }
        }

        if(this.actions.hideTooltip != null) {
            let self = this;
            elem.onmouseout = function(event) {
                event.stopPropagation();
                self.actions.hideTooltip();
            }
        }
    }
    
    // Select fills and values based on rectangular selection area
    rectangleSelection(selection) {
        // Get the SVG element
        let svg = this.diagramElem.querySelector('svg');

        // Convert the selection rectangle coordinates
        let selectionBox = {
            x1: selection.rect.x,
            x2: selection.rect.x + selection.rect.width,
            y1: selection.rect.y,
            y2: selection.rect.y + selection.rect.height
        };

        // Determine if point is inside selection box
        function pointInSelectionBox(point) {
            return point.x >= selectionBox.x1 && point.x <= selectionBox.x2 && 
                point.y >= selectionBox.y1 && point.y <= selectionBox.y2;
        }

        // Initialize an array of selected objects
        let selectedRows = [];

        // Iterate all the polygons
        let polygons = this.group.polygons;
        for(let thisPolygon of polygons) {
            // Iterate all the points in the polygon
            for(let thisPoint of thisPolygon.points) {
                let p = Utility.svgToScreen(svg, thisPoint[0], thisPoint[1]);
                let match = pointInSelectionBox(p);
                if(match == true) {
                    selectedRows.push(thisPolygon.object.row);
                    break;
                }
            }
        }

        return selectedRows;
    }

    // Clear marking
    clearMarking() {
        let configuration = this.configuration;
        let values = this.values;
        let fills = this.fills;

        // If marking is enabled, unmark everything
        if(configuration.marking != null) {
            for(let thisValue of values) {
                thisValue.row.mark('Subtract');
            }
            for(let thisFill of fills) {
                thisFill.row.mark('Subtract');
            }
        }
    }

}

