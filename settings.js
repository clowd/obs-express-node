const osn = require("obs-studio-node");
const _ = require("lodash");

function getData(category) {
    const settings = osn.NodeObs.OBS_settings_getSettings(category);

    if (_.isEmpty(settings) || _.isEmpty(settings.data))
        throw new Error("Invalid Category: Not found");

    return settings.data;
}

function setData(category, data) {
    osn.NodeObs.OBS_settings_saveSettings(category, data);
}

function setValue(data, subCategory, parameter, value) {
    var subobj = _.find(data, d => d.nameSubCategory.toUpperCase() === subCategory.toUpperCase());
    if (_.isEmpty(subobj) || _.isEmpty(subobj.parameters))
        throw new Error("Invalid Sub-Category: Not found");

    var parobj = _.find(subobj.parameters, p => p.name.toUpperCase() === parameter.toUpperCase());
    if (_.isEmpty(parobj))
        throw new Error("Invalid Parameter: Not found");

    switch (parobj.type) {
        case "OBS_PROPERTY_LIST":
            if (!_.isString(value))
                throw new Error("Invalid Value: Must be a string");

            const options = _.map(parobj.values, v => _(v).values().first());
            const oidx = _.findIndex(options, p => p.toUpperCase() === value.toUpperCase());
            if (oidx < 0)
                throw new Error("Invalid Value: Must be one of: " + _.join(options, ", "));

            parobj.currentValue = options[oidx];
            break;
        case "OBS_PROPERTY_INT":
            if (!_.isNumber(value))
                throw new Error("Invalid Value: Must be a number");

            break;
        case "OBS_PROPERTY_BOOL":
            if (!_.isBoolean(value))
                throw new Error("Invalid Value: Must be a boolean");

            break;
        case "OBS_PROPERTY_PATH":

            if (!_.isString(value))
                throw new Error("Invalid Value: Must be a valid path");


            break;
        default:
            throw new Error("Invalid Parameter: Parameter Type Not Supported");
    }
}

function setSetting(category, subCategory, parameter, value) {
    const data = getData(category);
    setValue(data, subCategory, parameter, value);
    setData(category, data);
}

function getSettingsCategory(category, small) {
    const data = getData(category);
    if (small) {
        return _(data).keyBy("nameSubCategory").mapValues(v =>
            _(v.parameters).keyBy("name").mapValues(x => x.currentValue)
        );
    } else {
        return data;
    }
}

function updateSettingsCategory(category, update) {

}


exports.setSetting = setSetting;
exports.getSettingsCategory = getSettingsCategory;