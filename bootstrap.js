// Imports
const {classes: Cc, interfaces: Ci, manager: Cm, results: Cr, utils: Cu, Constructor: CC} = Components;
Cm.QueryInterface(Ci.nsIComponentRegistrar);

const PromiseWorker = Cu.import('resource://gre/modules/PromiseWorker.jsm').BasePromiseWorker;
Cu.import('resource://gre/modules/osfile.jsm');
Cu.import('resource://gre/modules/Services.jsm');
Cu.import('resource://gre/modules/XPCOMUtils.jsm');

// Globals
var core = { // core has stuff added into by MainWorker (currently MainWorker) and then it is updated
	addon: {
		name: 'System Hotkey',
		id: 'System-Hotkey@jetpack',
		path: {
			name: 'system-hotkey',
			content: 'chrome://system-hotkey/content/',
			modules: 'chrome://system-hotkey/content/modules/'
		},
		prefbranch: 'extensions.System-Hotkey@jetpack.',
		prefs: {},
		cache_key: Math.random() // set to version on release
	},
	os: {
		name: OS.Constants.Sys.Name.toLowerCase(),
		toolkit: Services.appinfo.widgetToolkit.toLowerCase(),
		xpcomabi: Services.appinfo.XPCOMABI
	},
	firefox: {
		pid: Services.appinfo.processID,
		version: Services.appinfo.version
	}
};

var bootstrap = this;
var BOOTSTRAP = this;
const NS_HTML = 'http://www.w3.org/1999/xhtml';
const NS_XUL = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';

// Lazy Imports
const myServices = {};
XPCOMUtils.defineLazyGetter(myServices, 'hph', function () { return Cc['@mozilla.org/network/protocol;1?name=http'].getService(Ci.nsIHttpProtocolHandler); });

// START - Addon Functionalities					
// start - HotkeyWorkerMainThreadFuncs
var HotkeyWorkerMainThreadFuncs = {
	takeShot: function() {
		console.error('okkkkk hotkey pressed!');
	},
};
// end - HotkeyWorkerMainThreadFuncs
// END - Addon Functionalities

function install() {}
function uninstall(aData, aReason) {
	// delete imgur history file
	if (aReason == ADDON_UNINSTALL) {
		Services.prefs.clearUserPref(core.addon.prefbranch + 'quick_save_dir');
		Services.prefs.clearUserPref(core.addon.prefbranch + 'print_preview');
	}
}

function startup(aData, aReason) {
	// core.addon.aData = aData;
	extendCore();
	
	// set stuff in core, as it is sent to worker
	core.addon.version = aData.version;
	
	var promise_initHotkeys = SIPWorker('HotkeyWorker', core.addon.path.content + 'modules/hotkey/HotkeyWorker.js', core, HotkeyWorkerMainThreadFuncs).post();
	promise_initHotkeys.then(
		function(aVal) {
			console.log('Fullfilled - promise_initHotkeys - ', aVal);
			
		},
		genericReject.bind(null, 'promise_initHotkeys', 0)
	).catch(genericCatch.bind(null, 'promise_initHotkeys', 0));
}

function shutdown(aData, aReason) {
	if (aReason == APP_SHUTDOWN) { return }

	// destroy workers
	if (bootstrap.HotkeyWorker && HotkeyWorker.launchTimeStamp) {
		var promise_requestTerm = HotkeyWorker.post('prepTerm', []);
		promise_requestTerm.then(
			function(aVal) {
				console.log('Fullfilled - promise_requestTerm - ', aVal);
				// HotkeyWorker._worker.terminate();
			},
			genericReject.bind(null, 'promise_requestTerm', 0)
		).catch(genericCatch.bind(null, 'promise_requestTerm', 0));
	}
}

// start - common helper functions
function extendCore() {
	// adds some properties i use to core based on the current operating system, it needs a switch, thats why i couldnt put it into the core obj at top
	switch (core.os.name) {
		case 'winnt':
		case 'winmo':
		case 'wince':
			core.os.version = parseFloat(Services.sysinfo.getProperty('version'));
			// http://en.wikipedia.org/wiki/List_of_Microsoft_Windows_versions
			if (core.os.version == 6.0) {
				core.os.version_name = 'vista';
			}
			if (core.os.version >= 6.1) {
				core.os.version_name = '7+';
			}
			if (core.os.version == 5.1 || core.os.version == 5.2) { // 5.2 is 64bit xp
				core.os.version_name = 'xp';
			}
			break;
			
		case 'darwin':
			var userAgent = myServices.hph.userAgent;

			var version_osx = userAgent.match(/Mac OS X 10\.([\d\.]+)/);

			
			if (!version_osx) {
				throw new Error('Could not identify Mac OS X version.');
			} else {
				var version_osx_str = version_osx[1];
				var ints_split = version_osx[1].split('.');
				if (ints_split.length == 1) {
					core.os.version = parseInt(ints_split[0]);
				} else if (ints_split.length >= 2) {
					core.os.version = ints_split[0] + '.' + ints_split[1];
					if (ints_split.length > 2) {
						core.os.version += ints_split.slice(2).join('');
					}
					core.os.version = parseFloat(core.os.version);
				}
				// this makes it so that 10.10.0 becomes 10.100
				// 10.10.1 => 10.101
				// so can compare numerically, as 10.100 is less then 10.101
				
				//core.os.version = 6.9; // note: debug: temporarily forcing mac to be 10.6 so we can test kqueue
			}
			break;
		default:
			// nothing special
	}
	

}
// rev3 - https://gist.github.com/Noitidart/326f1282c780e3cb7390
function Deferred() {
	// update 062115 for typeof
	if (typeof(Promise) != 'undefined' && Promise.defer) {
		//need import of Promise.jsm for example: Cu.import('resource:/gree/modules/Promise.jsm');
		return Promise.defer();
	} else if (typeof(PromiseUtils) != 'undefined'  && PromiseUtils.defer) {
		//need import of PromiseUtils.jsm for example: Cu.import('resource:/gree/modules/PromiseUtils.jsm');
		return PromiseUtils.defer();
	} else {
		/* A method to resolve the associated Promise with the value passed.
		 * If the promise is already settled it does nothing.
		 *
		 * @param {anything} value : This value is used to resolve the promise
		 * If the value is a Promise then the associated promise assumes the state
		 * of Promise passed as value.
		 */
		this.resolve = null;

		/* A method to reject the assocaited Promise with the value passed.
		 * If the promise is already settled it does nothing.
		 *
		 * @param {anything} reason: The reason for the rejection of the Promise.
		 * Generally its an Error object. If however a Promise is passed, then the Promise
		 * itself will be the reason for rejection no matter the state of the Promise.
		 */
		this.reject = null;

		/* A newly created Pomise object.
		 * Initially in pending state.
		 */
		this.promise = new Promise(function(resolve, reject) {
			this.resolve = resolve;
			this.reject = reject;
		}.bind(this));
		Object.freeze(this);
	}
}
function genericReject(aPromiseName, aPromiseToReject, aReason) {
	var rejObj = {
		name: aPromiseName,
		aReason: aReason
	};
	console.error('Rejected - ' + aPromiseName + ' - ', rejObj);
	if (aPromiseToReject) {
		aPromiseToReject.reject(rejObj);
	}
}
function genericCatch(aPromiseName, aPromiseToReject, aCaught) {
	var rejObj = {
		name: aPromiseName,
		aCaught: aCaught
	};
	console.error('Caught - ' + aPromiseName + ' - ', rejObj);
	if (aPromiseToReject) {
		aPromiseToReject.reject(rejObj);
	}
}
// SIPWorker - rev9 - https://gist.github.com/Noitidart/92e55a3f7761ed60f14c
const SIP_CB_PREFIX = '_a_gen_cb_';
const SIP_TRANS_WORD = '_a_gen_trans_';
var sip_last_cb_id = -1;
function SIPWorker(workerScopeName, aPath, aCore=core, aFuncExecScope=BOOTSTRAP) {
	// update 022016 - delayed init till first .post
	// update 010516 - allowing pomiseworker to execute functions in this scope, supply aFuncExecScope, else leave it undefined and it will not set this part up
	// update 122115 - init resolves the deferred with the value returned from Worker, rather then forcing it to resolve at true
	// "Start and Initialize PromiseWorker"
	// returns promise
		// resolve value: jsBool true
	// aCore is what you want aCore to be populated with
	// aPath is something like `core.addon.path.content + 'modules/workers/blah-blah.js'`
	
	// :todo: add support and detection for regular ChromeWorker // maybe? cuz if i do then ill need to do ChromeWorker with callback
	
	// var deferredMain_SIPWorker = new Deferred();

	var cWorkerInited = false;
	var cWorkerPost_orig;
	
	if (!(workerScopeName in bootstrap)) {
		bootstrap[workerScopeName] = new PromiseWorker(aPath);
		
		cWorkerPost_orig = bootstrap[workerScopeName].post;
		
		bootstrap[workerScopeName].post = function(pFun, pArgs, pCosure, pTransfers) {
			if (!cWorkerInited) {
				var deferredMain_post = new Deferred();
				
				bootstrap[workerScopeName].post = cWorkerPost_orig;
				
				var doInit = function() {
					var promise_initWorker = bootstrap[workerScopeName].post('init', [aCore]);
					promise_initWorker.then(
						function(aVal) {
							console.log('Fullfilled - promise_initWorker - ', aVal);
							// start - do stuff here - promise_initWorker
							if (pFun) {
								doOrigPost();
							} else {
								// pFun is undefined, meaning devuser asked for instant init
								deferredMain_post.resolve(aVal);
							}
							// end - do stuff here - promise_initWorker
						},
						genericReject.bind(null, 'promise_initWorker', deferredMain_post)
					).catch(genericCatch.bind(null, 'promise_initWorker', deferredMain_post));
				};
				
				var doOrigPost = function() {
					var promise_origPosted = bootstrap[workerScopeName].post(pFun, pArgs, pCosure, pTransfers);
					promise_origPosted.then(
						function(aVal) {
							console.log('Fullfilled - promise_origPosted - ', aVal);
							deferredMain_post.resolve(aVal);
						},
						genericReject.bind(null, 'promise_origPosted', deferredMain_post)
					).catch(genericCatch.bind(null, 'promise_origPosted', deferredMain_post));
				};
				
				doInit();
				return deferredMain_post.promise;
			}
		};
		
		// start 010516 - allow worker to execute functions in bootstrap scope and get value
		if (aFuncExecScope) {
			// this triggers instantiation of the worker immediately
			var origOnmessage = bootstrap[workerScopeName]._worker.onmessage;
			var origOnerror = bootstrap[workerScopeName]._worker.onerror;
			
			bootstrap[workerScopeName]._worker.onerror = function(onErrorEvent) {
				// got an error that PromiseWorker did not know how to serialize. so we didnt get a {fail:.....} postMessage. so in onerror it does pop of the deferred. however with allowing promiseworker to return async, we cant simply pop if there are more then 1 promises pending
				var cQueue = bootstrap[workerScopeName]._queue._array;
				if (cQueue.length === 1) {
					// console.log('its fine for origOnerror it will just pop the only one there, which is the one to reject for sure as there are no other promises');
					// DO NOTE THOUGH - .onerror message might come in from any error, it is innate to worker to send this message on error, so it will pop out the promise early, so maybe i might run this origOnerror before the actual promise rejects due to catch
					origOnerror(onErrorEvent);
				} else {
					onErrorEvent.preventDefault(); // as they do this in origOnerror so i prevent here too
					console.error('queue has more then one promises in there, i dont know which one to reject', 'onErrorEvent:', onErrorEvent, 'queue:', bootstrap[workerScopeName]._queue._array);
				}
			};
			
			bootstrap[workerScopeName]._worker.onmessage = function(aMsgEvent) {
				////// start - my custom stuff
				var aMsgEventData = aMsgEvent.data;
				console.log('promiseworker receiving msg:', aMsgEventData);
				if (Array.isArray(aMsgEventData)) {
					// my custom stuff, PromiseWorker did self.postMessage to call a function from here
					console.log('promsieworker is trying to execute function in mainthread');
					
					var callbackPendingId;
					if (typeof aMsgEventData[aMsgEventData.length-1] == 'string' && aMsgEventData[aMsgEventData.length-1].indexOf(SIP_CB_PREFIX) == 0) {
						callbackPendingId = aMsgEventData.pop();
					}
					
					var funcName = aMsgEventData.shift();
					if (funcName in aFuncExecScope) {
						var rez_mainthread_call = aFuncExecScope[funcName].apply(null, aMsgEventData);
						
						if (callbackPendingId) {
							if (rez_mainthread_call.constructor.name == 'Promise') { // if get undefined here, that means i didnt return an array from the function in main thread that the worker called
								rez_mainthread_call.then(
									function(aVal) {
										if (aVal.length >= 2 && aVal[aVal.length-1] == SIP_TRANS_WORD && Array.isArray(aVal[aVal.length-2])) {
											// to transfer in callback, set last element in arr to SIP_TRANS_WORD and 2nd to last element an array of the transferables									// cannot transfer on promise reject, well can, but i didnt set it up as probably makes sense not to
											console.error('doing transferrrrr');
											aVal.pop();
											bootstrap[workerScopeName]._worker.postMessage([callbackPendingId, aVal], aVal.pop());
										} else {
											bootstrap[workerScopeName]._worker.postMessage([callbackPendingId, aVal]);
										}
									},
									function(aReason) {
										console.error('aReject:', aReason);
										bootstrap[workerScopeName]._worker.postMessage([callbackPendingId, ['promise_rejected', aReason]]);
									}
								).catch(
									function(aCatch) {
										console.error('aCatch:', aCatch);
										bootstrap[workerScopeName]._worker.postMessage([callbackPendingId, ['promise_rejected', aCatch]]);
									}
								);
							} else {
								// assume array
								if (rez_mainthread_call.length > 2 && rez_mainthread_call[rez_mainthread_call.length-1] == SIP_TRANS_WORD && Array.isArray(rez_mainthread_call[rez_mainthread_call.length-2])) {
									// to transfer in callback, set last element in arr to SIP_TRANS_WORD and 2nd to last element an array of the transferables									// cannot transfer on promise reject, well can, but i didnt set it up as probably makes sense not to
									rez_mainthread_call.pop();
									console.log('doiing traansfer');
									bootstrap[workerScopeName]._worker.postMessage([callbackPendingId, rez_mainthread_call], rez_mainthread_call.pop());
								} else {
									bootstrap[workerScopeName]._worker.postMessage([callbackPendingId, rez_mainthread_call]);
								}
							}
						}
					}
					else { console.error('funcName', funcName, 'not in scope of aFuncExecScope') } // else is intentionally on same line with console. so on finde replace all console. lines on release it will take this out
					////// end - my custom stuff
				} else {
					// find the entry in queue that matches this id, and move it to first position, otherwise i get the error `Internal error: expecting msg " + handler.id + ", " + " got " + data.id + ` --- this guy uses pop and otherwise might get the wrong id if i have multiple promises pending
					var cQueue = bootstrap[workerScopeName]._queue._array;
					var cQueueItemFound;
					for (var i=0; i<cQueue.length; i++) {
						if (cQueue[i].id == aMsgEvent.data.id) {
							cQueueItemFound = true;
							if (i !== 0) {
								// move it to first position
								var wasQueue = cQueue.slice(); // console.log('remove on production');
								cQueue.splice(0, 0, cQueue.splice(i, 1)[0]);
								console.log('ok moved q item from position', i, 'to position 0, this should fix that internal error, aMsgEvent.data.id:', aMsgEvent.data.id, 'queue is now:', cQueue, 'queue was:', wasQueue);
							}
							else { console.log('no need to reorder queue, the element of data.id:', aMsgEvent.data.id, 'is already in first position:', bootstrap[workerScopeName]._queue._array); }
							break;
						}
					}
					if (!cQueueItemFound) {
						console.error('errrrror: how on earth can it not find the item with this id in the queue? i dont throw here as the .pop will throw the internal error, aMsgEvent.data.id:', aMsgEvent.data.id, 'cQueue:', cQueue);
					}
					origOnmessage(aMsgEvent);
				}
			}
		}
		// end 010516 - allow worker to execute functions in bootstrap scope and get value
		
		if ('addon' in aCore && 'aData' in aCore.addon) {
			delete aCore.addon.aData; // we delete this because it has nsIFile and other crap it, but maybe in future if I need this I can try JSON.stringify'ing it
		}
	} else {
		throw new Error('Something is loaded into bootstrap[workerScopeName] already');
	}
	
	// return deferredMain_SIPWorker.promise;
	return bootstrap[workerScopeName];
	
}
// end - common helper functions