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
    "wellbore": {
        "label": "Wellbore",
        "perforationBaseWidth": {
            "label": "Perf Base Width",
            "datatype": "int"
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
        "plugWidth": {
            "label": "Plug Width",
            "datatype": "int"
        },
        "scales": {
            "diagramLeftPadding": {
                "label": "Diagram Left Padding",
                "datatype": "int"
            },
            "tvdScaleDisplay": {
                "label": "TVD Scale Display",
                "datatype": "boolean"
            },
            "tvdScaleGridDisplay": {
                "label": "TVD Scale Grid Display",
                "datatype": "boolean"
            },
            /*"tvdScaleFontSize": {
                "label": "TVD Scale Font Size",
                "datatype": "int"
            },*/
            "tvdScaleOffset": {
                "label": "TVD Scale Offset",
                "datatype": "int"
            }
        }
    }
}
