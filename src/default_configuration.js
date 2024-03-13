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
    "wellbore": {
        "perforationBaseWidth": 5,
        "perforationLength": 30,
        "perforationLeft": true,
        "perforationRight": true,
        "plugWidth": 5,
        "scales": {
            "diagramLeftPadding": 400,
            "tvdScaleDisplay": true,
            "tvdScaleGridDisplay": true,
            "tvdScaleOffset": 250
        }
    }
}
