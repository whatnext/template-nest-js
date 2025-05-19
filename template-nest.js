class TemplateNest {
    static cacheMap = {}; // Shared across all instances

    constructor(args) {
        const isBrowser = typeof window !== "undefined"
              && typeof window.document !== "undefined";

        const default_values = {
            template_dir: isBrowser ? "/templates" : "./templates",
            name_label: "TEMPLATE",
            token_delims: ['<!--%','%-->'],
            template_extension: "html",

            // If True, cache the template results temporarily according to
            // the TTL.
            cache: true,

            // TTL in milliseconds, default: 1 minute.
            cache_ttl: 1 * 60 * 1000,

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

            is_browser: isBrowser,
        };
        Object.assign(this, default_values, args);
    }

    render(structure) {
        const nest = this;
        const type = Object.prototype.toString.call( structure );

        let promise;
        if ( type === '[object Array]' )
            promise = nest._renderArray(structure);
        else if ( type ==='[object Object]' )
            promise = nest._renderObject(structure);
        else if ( type ==='[object Null]' )
            promise = new Promise((resolve,_) => { resolve('') });
        else
            promise = new Promise((resolve,_) => { resolve(structure) });

        return promise;
    }

    _setMap(key, value) {
        const now = Date.now();
        TemplateNest.cacheMap[key] = { value, expiresAt: now + this.cache_ttl };
    }

    _getMap(key) {
        const now = Date.now();
        const cacheItem = TemplateNest.cacheMap[key];
        if (!cacheItem || cacheItem.expiresAt < now) {
            delete TemplateNest.cacheMap[key];
            return null;
        }
        return cacheItem.value;
    }
    _getTemplate(template_name) {
        const nest = this;
        const url =
              nest.template_dir
              + '/'
              + template_name
              + '.'
              + nest.template_extension;

        return new Promise( function(resolve, reject) {
            if (nest.cache) {
                const cacheItem = nest._getMap(url);
                if (cacheItem !== null) {
                    resolve(cacheItem);
                    return;
                }
            }

            if (nest.is_browser)
                fetch(url)
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.text();
                })
                .then((template_body) => {
                    if (nest.cache)
                        nest._setMap(url, template_body);

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
                    } else {
                        if (nest.cache)
                            nest._setMap(url, data);

                        resolve(data);
                    }
                });
            }
        });
    }

    _getDefaultValue(name) {
        let value;

        // Check if the defaults object is defined and not empty
        if (this.defaults && Object.keys(this.defaults).length > 0) {
            // Try to find the value directly in the defaults object
            value = this.defaults[name];

            // If value not found and namespace character is defined
            if (!value && this.defaults_namespace_char && this.defaults_namespace_char.length > 0) {
                // Split the name by the namespace character and reverse the array
                let keys = name.split(this.defaults_namespace_char).reverse();

                // Initialize value with the last key
                value = this.defaults[keys.pop()];

                // Traverse the keys in reverse order to find the nested value
                while (keys.length > 0) {
                    let key = keys.pop();
                    if (value && value.hasOwnProperty(key)) {
                        value = value[key];
                    } else {
                        // If the key is not found in the current object, break the loop
                        break;
                    }
                }
            }
        }

        // Return the found value or an empty string if not found
        return value !== undefined ? value : '';
    }

    _renderArray(structure) {
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

    _renderObject(structure) {
        const nest = this;
        let template_name = structure[nest.name_label];

        if (!template_name)
            throw new Error("Template object was passed without a Name Label.");

        let file_promise = nest._getTemplate(template_name);
        return file_promise
            .then(async (template_body) => {
                let rendered = template_body;
                const regex = new RegExp(
                    `${nest.token_delims[0]}(.+?)${nest.token_delims[1]}`, 'gm'
                );

                const matches = [...template_body.matchAll(regex)];

                // Check if die-on-bad-params is true and if there are keys in
                // the template hash that are not present in the template file.
                if (nest.die_on_bad_params) {
                    const template_hash_variables = Object.keys(structure)
                          .filter(key => key !== nest.name_label);

                    const template_file_keys = new Set(matches.map(match => match[1].trim()));

                    if (template_hash_variables.some(key => !template_file_keys.has(key)))
                        throw new Error(`
                             Variables in template hash: ${template_hash_variables.sort().join(', ')}
                             Variables in template file: ${Array.from(template_file_keys).sort().join(', ')}
                             die-on-bad-params value: ${nest.die_on_bad_params}
                             All variables in template hash must be valid if die-on-bad-params is True.
                `);
                }

                const variables = matches.map(match => {
                    // Check if the variable is escaped
                    if (nest.token_escape_char && match.index >= nest.token_escape_char.length) {
                        const escape_char_start = match.index - nest.token_escape_char.length;
                        if (rendered.slice(escape_char_start, match.index) === nest.token_escape_char)
                            return {
                                start: match.index - 1,
                                end: match.index + match[0].length,
                                name: '',
                                indent_level: 0,
                                escaped_token: true
                            };
                    }

                    // Calculate the indent level.
                    let indent_level = 0;
                    if (match.index > 0) {
                        // Find the last newline character before the variable's
                        // start position
                        const newline_position = rendered.lastIndexOf('\n', match.index - 1);

                        // If there's no newline character before the variable,
                        // use the start position as the indent level Otherwise,
                        // calculate the difference between the start position
                        // and the position of the newline character
                        indent_level = newline_position === -1
                            ? match.index
                            : match.index - newline_position - 1;
                    }

                    return {
                        start: match.index,
                        end: match.index + match[0].length,
                        name: match[1].trim(),
                        indent_level,
                    };
                });

                variables.reverse();

                for (const variable of variables) {
                    if (variable.escaped_token === true) {
                        rendered = rendered.substring(0, variable.start)
                            + rendered.substring(variable.end);
                        continue;
                    }

                    let render = "";
                    if (structure[variable.name] !== undefined)
                        render = await nest.render(structure[variable.name]);
                    else
                        render = nest._getDefaultValue(variable.name);

                    // If fixed_indent is set then get the indent level and
                    // replace all newlines in the rendered string.
                    if (nest.fixed_indent && variable.indent_level !== 0) {
                        const replacement = "\n" + " ".repeat(variable.indent_level);
                        render = render.replace(/\n/g, replacement);
                    }

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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TemplateNest;
}
