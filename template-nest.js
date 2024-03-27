class TemplateNest {
    constructor(args) {
        const default_values = {
            template_dir: "/templates",
            name_label: "TEMPLATE",
            token_delims: ['<!--%','%-->'],
            template_extension: "html",

            // If True, add comment to the rendered output to make it easier to identify
            // which template the output is from.
            show_labels: false,

            // Used in conjuction with $.show-labels. If the template is not HTML then
            // this can be used to change output label.
            comment_delims: ['<!--', '-->'],

            // If True, then an attempt to populate a template with a variable that
            // doesn't exist (i.e. name not found in template) results in an error.
            die_on_bad_params: false,

            // Intended to improve readability when inspecting nested templates.
            fixed_indent: false,

            // To escape token delimiters.
            token_escape_char: '',

            defaults: {},
            defaults_namespace_char: '.',

            is_browser: typeof window !== "undefined"
                && typeof window.document !== "undefined"
        };
        Object.assign(this, default_values, args);
    }

    render( structure ) {
        const nest = this;
        const type = Object.prototype.toString.call( structure );

        let promise;
        if ( type === '[object Array]' )
            promise = nest._renderArray( structure );
        else if ( type ==='[object Object]' )
            promise = nest._renderObject( structure );
        else
            promise = new Promise( (resolve,reject) => { resolve( structure ) } );

        return promise;
    }

    _getTemplate( template_name ) {
        const nest = this;
        const url = nest.template_dir + '/' + template_name + '.html';
        return new Promise( function(resolve, reject) {
            if (nest.is_browser)
                fetch(url)
                .then((response) => {
                    return response.text();
                })
                .then((template_body) => {
                    resolve(template_body);
                })
                .catch((error) => {
                    reject(error);
                });
            else {
                const fs = require('node:fs');
                return fs.readFile(url, 'utf8', (err, data) => {
                    if (err) {
                        reject(err);
                    }
                    resolve(data);
                });
            }
        });
    }

    _renderArray( structure ) {
        const nest = this;
        const promises = [];

        for (let i = 0; i < structure.length; i++)
            promises.push( nest.render( structure[i] ) );

        let promise = Promise.all( promises ).then( function( snippets ) {
            let html = '';
            for (let i = 0; i < snippets.length; i++ )
                html += snippets[i];

            return html;
        });

        return promise;
    }

    _renderObject( structure ) {
        const nest = this;
        let template_name = structure[ nest.name_label ];

        if ( ! template_name )
            return console.error('A template structure object was passed without a template name');

        let file_promise = nest._getTemplate( template_name );
        return file_promise
            .then(async (template_body) => {
                let rendered = template_body;
                const regex = new RegExp(
                    `${nest.token_delims[0]}(.+?)${nest.token_delims[1]}`, 'gm'
                );

                const matches = [...template_body.matchAll(regex)];
                const variables = matches.map(match => ({
                    name: match[1].trim(),
                    start: match.index,
                    end: match.index + match[0].length
                }));

                variables.reverse();

                for (const variable of variables) {
                    const value = structure[variable.name];
                    let render = "";
                    if (value !== undefined && value !== null)
                        render = await nest.render(value);

                    rendered = rendered.substring(0, variable.start)
                        + render
                        + rendered.substring(variable.end);
                }

                // Add labels if show_labels is true
                if (nest.show_labels) {
                    const label_start = nest.comment_delims[0]
                          + " BEGIN "
                          + template_name
                          + " "
                          + nest.comment_delims[1]
                          + "\n";

                    const label_end = nest.comment_delims[0]
                          + " END "
                          + template_name
                          + " "
                          + nest.comment_delims[1]
                          + "\n";

                    rendered = label_start + rendered + label_end;
                }

                return rendered.trimEnd();
            });
    }
}

module.exports = TemplateNest;
