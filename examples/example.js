var enumBuilder = require('../src/Builder.js')

async function enumerateDevOps() {

  // let configText = fs.readFileSync('examples\\config.json');
  // let config = JSON.parse(configText);

  var enumerator = new enumBuilder.Builder()
    .setConfigFromFile('examples\\config.json')
    // .setPersonalAccessToken(config.pat)
    // .setOrgaization(config.organization)
    // .setProject(config.project)
    .latestReleasesPerEnvironment()
    // .latestReleasesOnly()
    // .useDefaultFilter(isDev)
    // .addAttachment('appsettings','appsettings.json', (a) => a.relativePath.includes('Unit') === false, 'json')
    // .retrieveEnvironmentVariables()
    .build()

  let output = await enumerator.enumerateDevOps();

  let now = Date.now();

  let mismatch = output.filter(f => {
    let allmatch = f.items.every(e => e.release.releaseid == f.items[0].release.releaseid);
    return allmatch == false;
  });

  mismatch.forEach(o => {
    let dates = o.items.map(o => Date.parse(o.release.completedOn));

    let newest = Math.max(...dates);
    let oldest = Math.min(...dates);

    let lastChange = now - newest;
    if (lastChange > 86400000 * 14)
      console.log(`${o.pipeline} - ${JSON.stringify(getDuration(newest - oldest))}`);
  });

  // console.log(JSON.stringify(mismatch));
}


function getDuration(milli) {
  let minutes = Math.floor(milli / 60000);
  let hours = Math.round(minutes / 60);
  let days = Math.round(hours / 24);

  return (
    (days && { value: days, unit: 'days' }) ||
    (hours && { value: hours, unit: 'hours' }) ||
    { value: minutes, unit: 'minutes' }
  )
};

function isDev(releaseName, environmentName) {
  // if (releaseName.trim().includes('Fre.Consignment.Api v2') === false)
  //     return false;

  // return environmentName.toLowerCase().includes("dev");
  return true;
}

enumerateDevOps();

console.log('bye bye');
