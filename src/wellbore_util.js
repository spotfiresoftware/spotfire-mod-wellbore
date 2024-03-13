class Utility {
    static hexToRgb(hexColor) {
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);
     
        return `(${r},${g},${b})`
    }

    static hexIsLight(hexColor) {
        let rgb = this.hexToRgb(hexColor);
        return this.rgbIsLight(rgb);
    }

    static rgbIsLight(rgbColor) {
        const firstParen = rgbColor.indexOf('(') + 1;
        const lastParen = rgbColor.indexOf(')');
        let colors = rgbColor.substring(firstParen, lastParen);
        colors = colors.split(',');
        var luma = 0.2126 * parseInt(colors[0]) + 0.7152 * parseInt(colors[1]) + 0.0722 * parseInt(colors[2]); // per ITU-R BT.709
        return luma > 160;
    }

    // Convert SVG coordinate to screen coordinate
    static svgToScreen(svg, svgX, svgY) {
        let p = svg.createSVGPoint()
        p.x = svgX;
        p.y = svgY;
        return p.matrixTransform(svg.getScreenCTM());
    }        

    // Convert screen coordinate to SVG coordinate
    static screenToSvg(svg, screenX, screenY) {
        let p = svg.createSVGPoint()
        p.x = screenX;
        p.y = screenY;
        return p.matrixTransform(svg.getScreenCTM().inverse());
    }
        
}