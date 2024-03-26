/*
Lookup redirect code and location via EdgeKV.
Make sure to download edgekv.js helper library from https://github.com/akamai/edgeworkers-examples/blob/master/edgekv/lib/edgekv.js
Place edgekv.js and generated edgekv_tokens.js in built directory. To create token:
$ akamai edgekv create token redirect_token --save_path=./ --staging=allow --production=deny --ewids=all --namespace=jgrinwiskv+r
*/
import { logger } from "log";
import { EdgeKV } from "./edgekv.js";

/*
A "cold-key" edgeKV lookup might take too long so just retry it x times.
Our namespace is in US, try to use the most optimal location EU or Asia for your customers.
We're also setting a global timeout (1-1000) we're going to use for reading and writing.
https://techdocs.akamai.com/edgekv/docs/library-helper-methods#constructor
*/
const edgeKvRedirect = new EdgeKV({ namespace: "jgrinwiskv", group: "redirect", num_retries_on_timeout: 2 });
const edgeKvTimeout = 500;

/*
Only lookup our possible redirect with the onOriginRequest event handler.
So if we have done a lookup before the redirect should be still in cache and as you know, cache is king.
*/
export async function onOriginRequest(request: EW.IngressOriginRequest) {

    // define interface representing our structure in EdgeKV
    interface EdgeKvRedirectInfo {
        code: number;
        location: string;
    }

    // Declare a variable of type MyRedirectInfo initialized with null
    let redirectInfo: EdgeKvRedirectInfo | null = null;

    /* 
    For now only doing a lookup on path, we can ofcourse add our own complex logic.
    request.path will be something like this /a/test/bla for example but EdgeKV only deal with a-z, A-Z,0-9, - and _ character.
    so we let the delivery configuration create an md5 hash of a request path and feed that as a PMUSER var.
    */
    let key = request.getVariable('PMUSER_PATH_HASH')

    /*
    As a test we've added /a (0639767F3E9EAAD729B54037A7E2ABF5) to our edgekv with a code and location value in json object
    $ akamai edgekv write jsonfile staging jgrinwiskv redirect 0639767F3E9EAAD729B54037A7E2ABF5 redirect.json
    The key is case sensitive!
    */
    logger.log(`looking up redirect for path: ${request.path} with key ${key}`)

    /*
    let's lookup our result using our helper library.
    The getjson method has the option for a default_value in case anything goes wrong (404)
    https://techdocs.akamai.com/edgekv/docs/library-helper-methods#getjson

    You can test if item is available via:
    $ akamai edgekv read item staging jgrinwiskv redirect 0639767F3E9EAAD729B54037A7E2ABF5
    */
    try {
        redirectInfo = await edgeKvRedirect.getJson({ item: key, timeout: edgeKvTimeout});
    }
    catch (error) {
        logger.log(`lookup for ${key} went rong: ${error}`)
    }

    /*
    If we have found an entry, use code and location from JSON object to generate a response
    Otherwise just do nothing and forward to origin
    */
    if (redirectInfo !== null) {
        request.respondWith(redirectInfo.code, {
            Location: [redirectInfo.location]
          }, '');
    } 
}