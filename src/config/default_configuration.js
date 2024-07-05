/*
 * Copyright © 2024. Cloud Software Group, Inc.
 * This file is subject to the license terms contained
 * in the license file that is distributed with this file.
 */

/* This object is used to populate the default configuration on mod creation into the mod properties. */
const defaultConfiguration = {
    "rowLimit": 1000,
    "trellisDirection": "Columns",
    "maxTrellisCount": 10,
    "showTooltips": true,
    "showZoomX": false,
    "showZoomY": false,
    "wellbore": {
        "gunWidth": 5,
        "gunColor": "purple",
        "perforationBaseWidth": 5,
        "perforationColor": "dimgrey",
        "perforationLength": 30,
        "perforationLeft": true,
        "perforationRight": true,
        "plugColor": "black",
        "plugWidth": 10,
        "scales": {
            "tvdScaleDisplay": true,
            "tvdScaleGridDisplay": true,
        }
    }
}
