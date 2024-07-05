/*
 * Copyright © 2024. Cloud Software Group, Inc.
 * This file is subject to the license terms contained
 * in the license file that is distributed with this file.
 */

const defaultConfigurationTemplate = {
    "label": "Display",
    "rowLimit": {
        "label": "Row Limit",
        "datatype": "int",
        "minVal": 0
    },
    "trellisDirection": {
        "label": "Trellis Direction",
        "datatype": "string",
        "enumeration": [
            "Rows",
            "Columns"
        ]
    },
    "maxTrellisCount": {
        "label": "Max Trellis Panel Count",
        "datatype": "int",
        "minVal": 0
    },
    "showTooltips": {
        "label": "Show Tooltips",
        "datatype": "boolean"
    },
    "showZoomX": {
        "label": "Show X Axis Zoom",
        "datatype": "boolean"
    },
    "showZoomY": {
        "label": "Show Y Axis Zoom",
        "datatype": "boolean"
    },
    "wellbore": {
        "label": "Wellbore",
        "gunWidth": {
            "label": "Gun Width",
            "datatype": "int"
        },
        "gunColor": {
            "label": "Gun Color",
            "datatype": "string"
        },
        "perforationBaseWidth": {
            "label": "Perf Base Width",
            "datatype": "int"
        },
        "perforationColor": {
            "label": "Perf Color",
            "datatype": "string"
        },
        "perforationLength": {
            "label": "Perf Length",
            "datatype": "int"
        },
        "perforationLeft": {
            "label": "Perf Left",
            "datatype": "boolean"
        },
        "perforationRight": {
            "label": "Perf Right",
            "datatype": "boolean"
        },
        "plugColor": {
            "label": "Plug Color",
            "datatype": "string"
        },
        "plugWidth": {
            "label": "Plug Width",
            "datatype": "int"
        },
        "scales": {
            "tvdScaleDisplay": {
                "label": "TVD Scale Display",
                "datatype": "boolean"
            },
            "tvdScaleGridDisplay": {
                "label": "TVD Scale Grid Display",
                "datatype": "boolean"
            },
        }
    }
}
