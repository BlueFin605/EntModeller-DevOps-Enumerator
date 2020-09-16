const https = require('https');
var Hjson = require('hjson');
const { release } = require('os');

function auth(pat) {
    let patStr = `:${pat}`;
    let bufferPat = Buffer.from(patStr);
    return bufferPat.toString('base64')
}

async function enumerateAzureReleases(configuration) {
    let releases = await getProductionReleases(configuration.pat, configuration.organization, configuration.project, configuration.filter, configuration.filterConfig, configuration.aggregateReleases);

    let azureReleases = await Promise.all(releases.map(p => findAdditionsForPipeline(configuration.pat, configuration.organization, configuration.project, p, configuration.attachmentsConfig, configuration.incEnvironment)));

    return azureReleases;
}

async function findAdditionsForPipeline(pat, organization, project, pipeline, attachmentsConfig, incEnvironment) {
    return extended = {
        pipeline: pipeline.pipeline,
        items: await Promise.all(pipeline.items.map(m => findAdditions(pat, organization, project, m, attachmentsConfig, incEnvironment)))
    }
}

async function findAdditions(pat, organization, project, release, attachmentsConfig, incEnvironment) {
    let mapped = {
        release: release,
        attachments: new Map(),
        environment: null //await restGET(release.environmenturl, pat)
    };

    //get all the environment variables
    if (incEnvironment) {
        mapped.environment = await findEnvironment(release, pat);
    }

    //get all the attachements
    await Promise.all(Array.from(attachmentsConfig).map(a => addAttachmentToRelease(pat, organization, project, mapped, a[1])));

    return mapped;
}

async function findEnvironment(release, pat) {
    return await restGET(release.environmenturl, pat);
}

async function addAttachmentToRelease(pat, organization, project, azureRelease, attachment) {
    let attachmentDetails = await getAttachment(pat, organization, project, azureRelease.release, attachment);

    if (attachmentDetails == null)
        return azureRelease;

    azureRelease.attachments.set(attachment.id, attachmentDetails);

    return azureRelease;
}

async function getAttachment(pat, organization, project, release, attachment) {
    let commitQuery = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${release.artifacts.repoId}/commits/${release.artifacts.sourceVersionId}?api-version=5.1`;
    let commit = await restGET(commitQuery, pat);
    if (commit == null)
        return null;

    let treeQuery = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${release.artifacts.repoId}/trees/${commit.treeId}?recursive=true&api-version=5.1`;
    let tree = await restGET(treeQuery, pat);
    if (tree == null || tree.treeEntries == null)
        return null;

    let appsettings = tree.treeEntries.filter(t => {
        return t.relativePath.endsWith(`/${attachment.filename}`) && (attachment.filter == null || attachment.filter(t) == true);
    });
    if (appsettings.length == 0)
        return null;

    let file = await restDownload(appsettings[0].url, pat);
    let validFile = file;

    try {
        if (attachment.mapper != null)
            return attachment.mapper(file);

        return file;
    }
    catch (error) {
        // console.log("======================================================================================================================");
        console.log(error);
        console.log(validFile);
        // console.log("----------------------------------------------------------------------------------------------------------------------");
        return null;
    }
}

async function getProductionReleases(pat, organization, project, filter, filterConfig, aggregateReleases) {
    let minStart = '2010-01-01T003:00:00.00Z';
    let result = await getReleasesBeforeDate(pat, organization, project, filter, filterConfig, minStart);
    let allResults = [];

    do {
        // while (result.results.length > 0) {    
        console.log(`last:${result.last}`);
        // let newResults = allResults.concat(result.results)
        let newResults = [...allResults, ...result.results];

        allResults = newResults;
        result = await getReleasesBeforeDate(pat, organization, project, filter, filterConfig, result.last);
    } while (result.last != null)


    var latestOnly = aggregateReleases(allResults);

    return Object.values(latestOnly);
}

async function getReleasesBeforeDate(pat, organization, project, filter, filterConfig, minStart) {
    let deployments = await getFilteredReleasesBeforeDate(pat, organization, project, filter, filterConfig, minStart);

    console.log(`REST results count:${deployments.results.length}`);

    //lets just take the latest of a particular release
    //TODO handle multiple releases within the same batch of releases
    var dictionary = deployments.results
        .reduce((accumulator, item) => {
            accumulator[`${item.releaseid}-${item.environment}`] = item;
            return accumulator;
        }, {});

    let filtered = [];

    //turn it back from a dictionary to an array
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
    if (deployment === null) {
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

        let repos = m.release.artifacts.filter(f => f.definitionReference != null && f.definitionReference.repository != null);
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

        console.log(`ger url:${url}`);
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
                    console.log(`${url} - ${error}`);
                    // console.log('Exception caught');
                    // console.log('=========================================================================================================================================');
                    // console.log(url);
                    // console.log(error);
                    // console.log(data);
                    // console.log('=========================================================================================================================================');
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

        console.log(`download:${url}`);
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

function jsonMapper(contents) {
    let start = contents.indexOf('{');
    validFile = contents.substring(start);
    let cfg = Hjson.parse(validFile);
    return cfg;
}

module.exports = enumerateAzureReleases;
module.exports.JsonMapper = jsonMapper;