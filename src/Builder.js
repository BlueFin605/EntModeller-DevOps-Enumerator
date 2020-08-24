var devopsenum = require('../src/enumerator.js')
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
        constructor(pat, organization, project, filter, filterConfig) {
            internal(this).pat = pat;
            internal(this).organization = organization;
            internal(this).project = project;
            internal(this).filter = filter;
            internal(this).filterConfig = filterConfig;
        }

        static get Builder() {
            class Builder {
                constructor() {
                    internal(this).filterConfig = new Map()
                }

                addConfigFromFile(filename)
                {
                    let configText = fs.readFileSync(filename);
                    let config = JSON.parse(configText);

                    internal(this).pat = config.pat;
                    internal(this).organization = config.organization;
                    internal(this).project = config.project;
                    return this
                }

                addPersonalAccessToken(pat) {
                    internal(this).pat = pat;
                    return this
                }

                addOrgaization(organization) {
                    internal(this).organization = organization;
                    return this
                }

                addProject(project) {
                    internal(this).project = project;
                    return this
                }

                addDefaultFilter(nameParser) {
                    internal(this).filter = doesMatchDefaultFilter;
                    internal(this).filterConfig.set('_parser', nameParser);
                    return this
                }

                build() {
                    var tracer = new DevOpsEnum(internal(this).pat,
                        internal(this).organization,
                        internal(this).project,
                        internal(this).filter,
                        internal(this).filterConfig);
                    return tracer;
                }
            }

            return Builder
        }

        async enumerateDevOps() {
            let results = devopsenum(internal(this).pat, internal(this).organization, internal(this).project, internal(this).filter, internal(this).filterConfig);
            return results;
        }
    }

    return DevOpsEnum
}())

function doesMatchDefaultFilter(dep, filterConfig) {
    if (filterConfig !== null && filterConfig.has('_parser'))
    {
        let nameParser = filterConfig.get('_parser');
        if (nameParser !== null && nameParser(dep.releaseEnvironment.name) === false)
            return false;
    }

    // if (isDev(dep.releaseEnvironment.name) === false)
    //     return false;

    if (dep.release === undefined)
        return false;

    if (dep.release.artifacts === undefined)
        return false;

    let repos = dep.release.artifacts.filter(f => {
        return f.definitionReference !== undefined && f.definitionReference.repository !== undefined
    });

    if (repos.length == 0)
        return false;

    return true;
}

module.exports.Builder = DevOpsEnum.Builder
