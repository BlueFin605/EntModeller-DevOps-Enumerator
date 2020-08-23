const https = require('https');
// const url = require('url');
// const ent = require('@bluefin605/entmodeller');
// const { release } = require('os');
var Hjson = require('hjson');
// const { isNullOrUndefined } = require('util');

function auth(pat) {
    let patStr = `:${pat}`;
    let bufferPat = Buffer.from(patStr);
    return bufferPat.toString('base64')
}

async function enumerateAzureReleases(pat, organization, project, filter, filterConfig) {
    // try {
    let releases = await getProductionReleases(pat, organization, project, filter, filterConfig);

    console.log('============================================releases===================================')
    releases.forEach(r => console.log(`${r.pipeline} ${r.release}`));
    console.log('============================================releases===================================')

    let withSettings = await Promise.all(releases.map(r => addSettings(pat, organization, project, r)));

    console.log('---------------------------------------------------------------')
    console.log(JSON.stringify(withSettings));
    console.log('---------------------------------------------------------------')

    return withSettings;
}


async function addSettings(pat, organization, project, resource) {
    resource.app = await getAppSettings(pat, organization, project, resource);

    resource.environment = await restGET(resource.environmenturl, pat);

    return resource;
}

async function getAppSettings(pat, organization, project, resource) {
    let commitQuery = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${resource.artifacts.repoId}/commits/${resource.artifacts.sourceVersionId}?api-version=5.1`;
    let commit = await restGET(commitQuery, pat);
    if (commit === null)
        return null;

    let treeQuery = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${resource.artifacts.repoId}/trees/${commit.treeId}?recursive=true&api-version=5.1`;
    let tree = await restGET(treeQuery, pat);
    if (tree === undefined || tree.treeEntries === undefined)
        return null;

    let appsettings = tree.treeEntries.filter(t => {
        return t.relativePath.endsWith('/appsettings.json') && t.relativePath.includes('Unit') === false;
    });
    if (appsettings.length == 0)
        return null;

    let file = await restDownload(appsettings[0].url, pat);
    let validFile = file;

    try {
        let start = file.indexOf('{');
        validFile = file.substring(start);
        // console.log(`${resource.pipeline}:${resource.release}:${resource.artifacts.sourceVersionId}:${appsettings[0].url}======================================================================================================================`);
        // console.log(file);
        let cfg = Hjson.parse(validFile);
        return cfg;
    }
    catch (error) {
        // console.log("======================================================================================================================");
        console.log(error);
        console.log(validFile);
        // console.log("----------------------------------------------------------------------------------------------------------------------");
        return null;
    }
}

async function getProductionReleases(pat, organization, project, filter, filterConfig) {
    let minStart = '2010-01-01T003:00:00.00Z';
    let result = await getReleasesBeforeDate(pat, organization, project, filter, filterConfig, minStart);
    let allResults = [];

    do {
        // while (result.results.length > 0) {    
        console.log(result.last);
        // let newResults = allResults.concat(result.results)
        let newResults = [...allResults, ...result.results];

        allResults = newResults;
        result = await getReleasesBeforeDate(pat, organization, project, filter, filterConfig, result.last);
    } while (result.last != null)

    // return allResults;

    var latestOnly = allResults
        .reduce((accumulator, item) => {
            if (item.pipeline in accumulator) {
                if (item.releaseid > accumulator[item.pipeline].releaseid) {
                    accumulator[item.pipeline] = item;
                }
            } else {
                accumulator[item.pipeline] = item;
            }
            return accumulator;
        }, {});


    return Object.values(latestOnly);
}

async function getReleasesBeforeDate(pat, organization, project, filter, filterConfig, minStart) {
    let deployments = await getFilteredReleasesBeforeDate(pat, organization, project, filter, filterConfig, minStart);

    console.log(`REST results count:${deployments.results.length}`);

    var dictionary = deployments.results
        .reduce((accumulator, item) => {
            accumulator[item.releaseid] = item;
            return accumulator;
        }, {});

    let filtered = [];

    for (var key in dictionary) {
        filtered.push(dictionary[key]);
    }

    let result = {};
    result.results = filtered
    result.last = deployments.last;
    return result;
}

async function getFilteredReleasesBeforeDate(pat, organization, project, filter, filterConfig, minStart) {
    let query = `https://vsrm.dev.azure.com/${organization}/${project}/_apis/release/deployments?api-version=5.1&deploymentStatus=succeeded&$top=100&queryOrder=ascending&minStartedTime=${minStart}`;
    let deployment = await restGET(query, pat);
    if (deployment === null)
    {
        throw 'fatal error';
    }
    console.log(`REST results count:${deployment.count}`);
    var dictionary = deployment.value.filter(dep => filter(dep, filterConfig)).map(m => {
        console.log(`${m.releaseDefinition.name}::${m.release.name}::${m.releaseEnvironment.name}`);
        let mapped = {};
        mapped.environment = m.releaseEnvironment.name
        mapped.completedOn = m.completedOn
        mapped.id = m.id;
        mapped.release = m.release.name;
        mapped.releaseid = m.release.id;
        mapped.releaseurl = m.release.url;
        mapped.pipeline = m.releaseDefinition.name;
        mapped.environmenturl = m.releaseDefinition.url;
        mapped.status = m.deploymentStatus
        mapped.artifacts = {};

        let repos = m.release.artifacts.filter(f => f.definitionReference !== undefined && f.definitionReference.repository !== undefined);
        if (repos.length > 0) {
            mapped.artifacts.repoId = repos[0].definitionReference.repository.id;
            mapped.artifacts.repoName = repos[0].definitionReference.repository.name;
            mapped.artifacts.sourceVersionId = repos[0].definitionReference.sourceVersion.id;
        }
        return mapped;
    });

    if (deployment.value.length == 0) {
        return { results: dictionary, last: null };
    }

    let max = deployment.value[deployment.value.length - 1].completedOn;
    let maxDate = new Date(max);
    let result = { results: dictionary, last: maxDate.toISOString() };

    return result;
}

function restGET(url, pat) {
    return new Promise(resolve => {
        var data = '';

        const options = {
            headers: {
                'Authorization': `Basic ${auth(pat)}`
            },
        };

        console.log(url);
        https.get(url, options, (resp) => {
            // console.log(resp.headers);

            // A chunk of data has been recieved.
            resp.on('data', (chunk) => {
                data += chunk;
            });

            // The whole response has been received. Print out the result.
            resp.on('end', () => {
                try {
                    let ob = Hjson.parse(data);
                    // console.log(`end found[${JSON.stringify(ob)}]`);
                    // console.log('=========================================================================================================================================');
                    // console.log(`end found[${data}]`);
                    // console.log('=========================================================================================================================================');
                    resolve(ob);
                } catch (error) {
                    console.log('Exception caught');
                    console.log('=========================================================================================================================================');
                    console.log(url);
                    console.log(error);
                    // console.log(data);
                    console.log('=========================================================================================================================================');
                    resolve(null);
                }
            });

            resp.on('error', () => {
                console.log("Error[GET]: " + err.message + ':[' + url + ']');
                resolve(null);
            });

        }).on("error", (err) => {
            console.log("Error[GET]: " + err.message + ':[' + url + ']');
            resolve(null);
        });
    });
}

function restDownload(url, pat) {
    return new Promise(resolve => {
        var data = '';

        const options = {
            headers: {
                'Authorization': `Basic ${auth(pat)}`
            },
        };

        console.log(url);
        https.get(url, options, (resp) => {
            // console.log(resp.headers);

            // A chunk of data has been recieved.
            resp.on('data', (chunk) => {
                data += chunk;
            });

            // The whole response has been received. Print out the result.
            resp.on('end', () => {
                // console.log(`end found[${typeof (data)}]`);
                resolve(data);
            });

        }).on("error", (err) => {
            console.log("Error[Download]: " + err.message + ':[' + url + ']');
        });
    });
}

module.exports = enumerateAzureReleases;