const osn = require("obs-studio-node");
const _ = require("lodash");

function getData(category) {
    const settings = osn.NodeObs.OBS_settings_getSettings(category);

    if (_.isEmpty(settings) || _.isEmpty(settings.data))
        throw new Error(`Invalid settings category: '${category}' not found`);

    return settings.data;
}

function setData(category, data) {
    osn.NodeObs.OBS_settings_saveSettings(category, data);
}

function setValue(data, subCategory, parameter, value) {
    const subobj = _.find(data, d => d.nameSubCategory.toUpperCase() === subCategory.toUpperCase());
    if (_.isEmpty(subobj) || _.isEmpty(subobj.parameters))
        throw new Error(`Invalid settings sub-category: '${subCategory}' not found`);

    const parobj = _.find(subobj.parameters, p => p.name.toUpperCase() === parameter.toUpperCase());
    if (_.isEmpty(parobj))
        throw new Error(`Invalid settings parameter: '${parameter}' not found`);

    switch (parobj.type) {
        case "OBS_PROPERTY_LIST":
            if (!_.isString(value))
                throw new Error(`Invalid settings value: '${value}' must be a string`);

            const options = _.map(parobj.values, v => _(v).values().first());
            const oidx = _.findIndex(options, p => p.toUpperCase() === value.toUpperCase());
            if (oidx < 0)
                throw new Error(`Invalid settings value: '${value}' must be one of ${_.join(options, ", ")}`);

            parobj.currentValue = options[oidx];
            break;
        case "OBS_PROPERTY_UINT":
        case "OBS_PROPERTY_BITMASK":
        case "OBS_PROPERTY_INT":
            if (!_.isNumber(value))
                throw new Error(`Invalid settings value: '${value}' must be a number`);
            parobj.currentValue = value;
            break;
        case "OBS_PROPERTY_BOOL":
            if (!_.isBoolean(value))
                throw new Error(`Invalid settings value: '${value}' must be a boolean`);
            parobj.currentValue = value;
            break;
        case "OBS_PROPERTY_EDIT_TEXT":
        case "OBS_INPUT_RESOLUTION_LIST":
        case "OBS_PROPERTY_PATH":
            if (!_.isString(value))
                throw new Error(`Invalid settings value: '${value}' must be a valid path`);
            parobj.currentValue = value;
            break;
        default:
            throw new Error("Invalid settings parameter: Parameter Type '" + parobj.type + "' Not Supported");
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
            _(v.parameters).keyBy("name").mapValues(x => x.currentValue).value()
        ).value();
    } else {
        return data;
    }
}

function updateSettingsCategory(category, update) {
    const data = getData(category);
    for (const subcat in update) {
        const subobj = update[subcat];
        for (const sparam in subobj) {
            const value = subobj[sparam];
            setValue(data, subcat, sparam, value);
        }
    }
    setData(category, data);
}

function getAvailableValues(category, subCategory, parameter) {
    const data = getData(category);
    const subobj = _.find(data, d => d.nameSubCategory.toUpperCase() === subCategory.toUpperCase());
    if (_.isEmpty(subobj) || _.isEmpty(subobj.parameters))
        throw new Error(`Invalid settings sub-category: '${subCategory}' not found`);

    const parobj = _.find(subobj.parameters, p => p.name.toUpperCase() === parameter.toUpperCase());
    if (_.isEmpty(parobj))
        throw new Error(`Invalid settings parameter: '${parameter}' not found`);

    return _.map(parobj.values, p => _.values(p)[0]);
}

exports.getAvailableValues = getAvailableValues;
exports.setSetting = setSetting;
exports.getSettingsCategory = getSettingsCategory;
exports.updateSettingsCategory = updateSettingsCategory;