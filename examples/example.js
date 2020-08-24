var enumBuilder = require('../src/Builder.js')
// var devopsenum = require('../src/enumerator.js')
// var fs = require('fs');



async function enumerateDevOps() {

  // let configText = fs.readFileSync('examples\\config.json');
  // let config = JSON.parse(configText);

  var enumerator = new enumBuilder.Builder()
    .addConfigFromFile('examples\\config.json')
    // .addPersonalAccessToken(config.pat)
    // .addOrgaization(config.organization)
    // .addProject(config.project)
    .addDefaultFilter(isDev)
    .build()

  let output = await enumerator.enumerateDevOps();
  console.log(output);
}


function isDev(name) {
  return name.toLowerCase().includes("dev");
}

enumerateDevOps();

console.log('bye bye');
