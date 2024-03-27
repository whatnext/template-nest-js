class TemplateNest {
    constructor(args) {
        args = Object.assign(args, {
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
        });
        Object.assign(this, args);

        this.isBrowser = typeof window !== "undefined"
            && typeof window.document !== "undefined";
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
            if (nest.isBrowser)
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
        let template_name = structure[ nest.template_ident ];

        if ( ! template_name )
            console.error('A template structure object was passed without a template name');
        else {
            const param_keys = [];
            const param_proms = [];

            for (let key in structure) {
                if ( key === nest.template_ident )
                    continue;
                param_keys.push( key );
                param_proms.push( nest.render( structure[ key ] ) );
            }

            let file_promise = nest._getTemplate( template_name );
            let param_promise = file_promise.then( function( template_body ) {
                return Promise.all( param_proms ).then( function(param_vals) {
                    let html = template_body;

                    for (let i = 0; i < param_keys.length; i++) {
                        const regex = new RegExp(
                            nest.token_delims[0]
                                + '\\s+'
                                + param_keys[i]
                                + '\\s+'
                                + nest.token_delims[1], 'gm'
                        );
                        html = html.replace( regex, param_vals[i] );
                    }
                    return html;
                });
            });

            return param_promise;
        }
    }
}

module.exports = TemplateNest;
