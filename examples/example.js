var enumBuilder = require('../src/Builder.js')

async function enumerateDevOps() {

  // let configText = fs.readFileSync('examples\\config.json');
  // let config = JSON.parse(configText);

  var enumerator = new enumBuilder.Builder()
    .setConfigFromFile('examples\\config.json')
    // .setPersonalAccessToken(config.pat)
    // .setOrgaization(config.organization)
    // .setProject(config.project)
    .addDefaultFilter(isDev)
    .addAttachment('appsettings','appsettings.json', (a) => a.relativePath.includes('Unit') === false, enumBuilder.JsonMapper)
    .build()

  let output = await enumerator.enumerateDevOps();
  console.log(JSON.stringify(output));
}


function isDev(releaseName, environmentName) {
  return environmentName.toLowerCase().includes("dev");
}

enumerateDevOps();

console.log('bye bye');
