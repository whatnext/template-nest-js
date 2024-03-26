const TemplateNest = require('./template-nest');

const template_dir = "./templates";
const nest = new TemplateNest(template_dir);
const page = {
    "TEMPLATE": "00-simple-page",
    "variable": "Simple Variable",
    "simple_component": {
        "TEMPLATE": "01-simple-component",
    }
};
(async() => {
    const output = await nest.render(page);
    console.log(output);
})();
