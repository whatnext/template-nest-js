class TemplateNest {

    constructor( template_dir ){
        this.template_dir = template_dir;
        this.template_ident = 'TEMPLATE';
        this.token_delims = ['<!--%','%-->'];
    }

    render( structure ){
        let nest = this;

        let promise;
        let type = Object.prototype.toString.call( structure );
        if ( type === '[object Array]' ){
            promise = nest._renderArray( structure );
        } else if ( type ==='[object Object]' ){
            promise = nest._renderObject( structure );
        } else {
            promise = new Promise( (resolve,reject) => { resolve( structure ) } );
        }

        return promise;
    }

    _renderArray( structure ){

        var nest = this;
        var promises = [];

        for(let i=0; i<structure.length; i++){
            promises.push( nest.render( structure[i] ) );
        }

        let promise = Promise.all( promises ).then( function( snippets ){
            let html = '';
            for( let i=0; i < snippets.length; i++ ){
                html += snippets[i];
            }
            return html;
        });

        return promise;
    }

    _renderObject( structure ){

        let nest = this;

        let template_name = structure[ nest.template_ident ];
        if ( ! template_name ){

            console.error('A template structure object was passed without a template name');

        } else {

            let param_keys = [];
            let param_proms = [];

            for(let key in structure){
                if ( key === nest.template_ident ) continue;
                param_keys.push( key );
                param_proms.push( nest.render( structure[ key ] ) );
            }

            let url = nest.template_dir + '/' + template_name + '.html';

            let promise = new Promise( function(resolve,reject){
                $.ajax({
                    method: 'GET',
                    type: 'json',
                    url: url,
                    success: function( template_body ){
                        resolve( template_body );
                    }
                });
            });

            let param_promise = promise.then( function( template_body ){
                return Promise.all( param_proms ).then( function(param_vals){
                    let html = template_body;
                    for( let i=0; i < param_keys.length; i++){
                        let regex = new RegExp( nest.token_delims[0] + '\\s+' + param_keys[i] + '\\s+' + nest.token_delims[1], 'gm' );
                        html = html.replace( regex, param_vals[i] );
                    }
                    return html;
                });
            });

            return param_promise;

        }
    }
}
