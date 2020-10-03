var devopsenum = require('./enumerator.js')
var fs = require('fs');

const DevOpsEnum = (function () {
    const _private = new WeakMap()

    const internal = (key) => {
        // Initialize if not created
        if (!_private.has(key)) {
            _private.set(key, {})
        }
        // Return private properties object
        return _private.get(key)
    }

    class DevOpsEnum {
        constructor(configuration) {
            internal(this).configuration = configuration;
        }

        static get Builder() {
            class Builder {
                constructor() {
                    internal(this).filter = (dep, filterConfig) => true;
                    internal(this).filterConfig = new Map()
                    internal(this).attachmentsConfig = new Map()
                    internal(this).aggregateReleases = aggregateAllReleases;
                }

                setConfigFromFile(filename) {
                    let configText = fs.readFileSync(filename);
                    let config = JSON.parse(configText);

                    internal(this).pat = config.pat;
                    internal(this).organization = config.organization;
                    internal(this).project = config.project;
                    return this
                }

                setPersonalAccessToken(pat) {
                    internal(this).pat = pat;
                    return this
                }

                setOrgaization(organization) {
                    internal(this).organization = organization;
                    return this
                }

                setProject(project) {
                    internal(this).project = project;
                    return this
                }

                useDefaultFilter(nameParser) {
                    internal(this).filter = doesMatchDefaultFilter;
                    internal(this).filterConfig.set('_parser', nameParser);
                    return this
                }

                addAttachment(id, filename, filter, responseType) {
                    let config = {
                        id: id,
                        filename: filename,
                        filter: filter,
                        responseType: responseType
                    }

                    internal(this).attachmentsConfig.set(id, config);
                    return this
                }

                retrieveEnvironmentVariables() {
                    internal(this).incEnvironment = true;
                    return this
                }

                latestReleasesOnly() {
                    internal(this).aggregateReleases = aggregateLatest;
                    return this
                }

                latestReleasesPerEnvironment() {
                    internal(this).aggregateReleases = aggregateLatestPerEnvironment;
                    return this
                }

                oneReleasePerDay() {
                    internal(this).aggregateReleases = aggregateReleaseByDay;
                    return this
                }

                build() {
                    let configuration = {
                        pat: internal(this).pat,
                        organization: internal(this).organization,
                        project: internal(this).project,
                        filter: internal(this).filter,
                        filterConfig: internal(this).filterConfig,
                        attachmentsConfig: internal(this).attachmentsConfig,
                        incEnvironment: internal(this).incEnvironment,
                        aggregateReleases: internal(this).aggregateReleases
                    };

                    var tracer = new DevOpsEnum(configuration);
                    return tracer;
                }
            }

            return Builder
        }

        async enumerateDevOps() {
            let results = devopsenum(internal(this).configuration);
            return results;
        }
    }

    return DevOpsEnum
}())

function doesMatchDefaultFilter(dep, filterConfig) {
    if (filterConfig !== null && filterConfig.has('_parser')) {
        let nameParser = filterConfig.get('_parser');
        if (nameParser !== null && nameParser(dep.releaseDefinition.name, dep.releaseEnvironment.name) === false)
            return false;
    }

    if (dep.release == null)
        return false;

    if (dep.release.artifacts == null)
        return false;

    let repos = dep.release.artifacts.filter(f => {
        return f.definitionReference !== undefined && f.definitionReference.repository !== undefined
    });

    if (repos.length == 0)
        return false;

    return true;
}

// find the latest release for each pipeline
function aggregateLatest(releases) {
    return releases.reduce((accumulator, item) => {
        if (item.pipeline in accumulator) {
            if (item.releaseid > accumulator[item.pipeline].items[0].releaseid) {
                accumulator[item.pipeline] = {
                    pipeline: item.pipeline,
                    items: [item]
                };
            }
        } else {
            accumulator[item.pipeline] = {
                pipeline: item.pipeline,
                items: [item]
            };
        }
        return accumulator;
    }, {});
}

// find the latest release for each environment in each pipeline
function aggregateLatestPerEnvironment(releases) {
    return releases.reduce((accumulator, item) => {
        if (item.pipeline in accumulator) {
            let found = accumulator[item.pipeline].items.find(p => p.environment == item.environment);
            if (found == null) {
                accumulator[item.pipeline].items.push(item);
            } else
            if (item.releaseid > found.releaseid) {
                let filtered = accumulator[item.pipeline].items.filter(p => p.environment != item.environment)
                accumulator[item.pipeline].items = filtered;
                accumulator[item.pipeline].items.push(item);
            }
        } else {
            accumulator[item.pipeline] = {
                pipeline: item.pipeline,
                items: [item]
            };
        }
        return accumulator;
    }, {});
}

// find all releases
function aggregateAllReleases(releases) {
    return releases.reduce((accumulator, item) => {
        if (item.pipeline in accumulator) {
            accumulator[item.pipeline].items.push(item);
        } else {
            accumulator[item.pipeline] = {
                pipeline: item.pipeline,
                items: [item]
            };
        }
        return accumulator;
    }, {});
}


// find one release id per day, effectively ignores the individual environments
function aggregateReleaseByDay(releases) {
    return releases.reduce((accumulator, item) => {
        if (item.pipeline in accumulator) {
            if (!accumulator[item.pipeline].items.some(s => {
                if (s.releaseid !== item.releaseid)
                    return false;

                    let date1 = new Date(s.completedOn);
                    date1.setHours(0,0,0,0)

                    let date2 = new Date(item.completedOn);
                    date2.setHours(0,0,0,0)
                    return date1.valueOf() === date2.valueOf();
            })) {
                accumulator[item.pipeline].items.push(item);
            }
        } else {
            accumulator[item.pipeline] = {
                pipeline: item.pipeline,
                items: [item]
            };
        }
        return accumulator;
    }, {});
}

module.exports.Builder = DevOpsEnum.Builder
