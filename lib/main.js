/* Source code for fileWatcher firefox plugin
 * Authors: Karl Gäfvert, Rasmus Linusson
 * License: Unknown, Pending
 */
 
 // Includes
const {Cu} = require("chrome");
const {OS} = Cu.import("resource://gre/modules/osfile.jsm", {});
var tabs = require("sdk/tabs");
var sys = require("sdk/system");
var pref = require('sdk/simple-prefs');
var {ActionButton} = require("sdk/ui/button/action");
var {setInterval, clearInterval} = require("sdk/timers");

// Callbacks
tabs.on("ready", onReadyState);
tabs.on("close", deregisterIntervalTimer);
tabs.on('activate', onActivate);
pref.on('fileCheckRate', onPref_fileCheckRate)

// Constants
var toggleButtonDisabledText = "Enable auto-(file)update for this tab";
var toggleButtonEnabledText = "Disable auto-(file)update for this tab";
var toggleButtonOffText = "Only works with local files!";

var activeIcons = {
    "16": "./images/16-active.png",
    "32": "./images/32-active.png",
    "64": "./images/64-active.png"
};

var inactiveIcons = {
    "16": "./images/16-inactive.png",
    "32": "./images/32-inactive.png",
    "64": "./images/64-inactive.png"
};

// Globals
var fileCheckRate = pref.prefs['fileCheckRate'];

var toggleButton = ActionButton({
    id: "toggleButton",
    label: "Plugin uninitialized",
    icon: inactiveIcons,
    disabled: true,
    onClick: function() {
        toggleTimer();
    }
});

var activeTargets = [];

/* Handle new values set in preferences,
 * make sure they're within range and 
 * update active timers to this value
 */
function onPref_fileCheckRate() {
	var newValue = pref.prefs['fileCheckRate'];
	
	if (newValue < 50)
		newValue = pref.prefs['fileCheckRate'] = 50;
	else if (newValue > 2147000000)
		newValue = pref.prefs['fileCheckRate'] = 2147000000;
	
	fileCheckRate = newValue;
	updateTimerInteval();
}

/* Register new timer if tab is a local 
 * file, otherwise deregister.
 */
function onReadyState(tab) {
	if (tab.url.indexOf("file://") != -1) {
        var target = getActiveTarget(tab.id);
		if (target == null) {
			target = {tab: tab, intervalTimer: null, lastMod: null, lastSize: -1}
            activeTargets.push(target);
			
			if (pref.prefs['defaultEnabled']) {
				target.intervalTimer = 
				setInterval(
					function() {
					   checkFile(target) 
					}, fileCheckRate);
			}
        }
    }
    else {
        var t = getActiveTarget(tab.id);
        if (t != null)
            deregisterIntervalTimer(t.tab);
    }
    modifyTabState(tab);
}

/* Main function of the plugin.
 * A callback from the individual timers
 * for each active target. This function
 * will check if the file has been changed
 * by comparing size and modification time.
 *
 * If file is change -> reload tab.
 */
function checkFile(target) {
    var path = target.tab.url;
    if (sys.platform == "winnt") // Check if windows
        path = path.substring(8).split("/").join("\\"); // Cuz, stupid paths -.-'
    else
        path = path.substring(7);

    let file = OS.File.stat(path);
    file.then(function onSuccess(info) {
        var newDate = info.lastModificationDate;
        var newSize = info.size;
		
		if (target.lastMod == null) {
			target.lastMod = newDate;
			target.lastSize = newSize;
		}		
        else if (newSize != target.lastSize) {
            target.tab.reload();
            target.lastMod = newDate;
            target.lastSize = newSize;
        }
        else if (newDate > target.lastMod) {
            target.tab.reload();
            target.lastMod = newDate;
            target.lastSize = newSize;
        }
    },
    function onFailure(reason) {
        if (reason instanceof OS.File.Error && reason.becauseNoSuchFile) {
            console.log(path,"No such file!!");
        } 
        else {
            throw reason;
        }
    });
}

/* Removes the target and it's callback timer
 */
function deregisterIntervalTimer(tab) {
    var t = getActiveTarget(tab.id);
    if (t != null) {
        clearInterval(t.intervalTimer);
        activeTargets.splice(activeTargets.indexOf(t), 1);
    }
}

/* Update the timer interval for all targets
 */
function updateTimerInteval() {
	for (t of activeTargets) {
		if (t.intervalTimer != null) {
			clearInterval(t.intervalTimer);
			t.intervalTimer = setInterval(
				function() {
				   checkFile(t) 
				}, fileCheckRate);
		}
	}
}

/* Return the target for a given tab id
 * returns null if no target matches
 */
function getActiveTarget(tabID) {
    for (t of activeTargets) {
        if (t.tab.id == tabID)
            return t;
    }
    return null;
}

/* Mozilla is kind of stupid and call onClose() when moving a tab to a new window.
 * After this, they don't call onReady() and as such we will destroy the target
 * not creating a new one - resulting in t being resolved to null in this case.
 * To work around this, we fake a call to onReady()
 */
function onActivate(tab) {
	var t = getActiveTarget(tab.id);
	if (t == null) // Goddamnit Mozilla!
		onReadyState(tab);
	else
		modifyTabState(tab);
}

/* Tabstate is the state of the plugin button/action
 * in the browser toolbar. It can hold three different
 * states; active, inactive and deactivated
 */
function modifyTabState(tab) {
    if (tab.url.indexOf("file:///") != -1) {
        var t = getActiveTarget(tab.id);
		
        if (t.intervalTimer == null) {
            toggleButton.state(tab, {
				disabled: false,
				label: toggleButtonDisabledText,
                icon: inactiveIcons
			});
        }
        else {
            toggleButton.state(tab, {
				disabled: false,
				label: toggleButtonEnabledText,
				icon: activeIcons
			});
        }
    }
    else {
        toggleButton.state(tab, {
			disabled: true,
			label: toggleButtonOffText,
			icon: inactiveIcons
		});
    }
}

/* Toggle the callback timer for active target
 * when plugin button is clicked
 */
function toggleTimer() {
    var t = getActiveTarget(tabs.activeTab.id);
    if (t.intervalTimer == null) {
        t.intervalTimer = setInterval(
            function() {
                checkFile(t);
            },  fileCheckRate);
    }
    else {
        clearInterval(t.intervalTimer);
        t.intervalTimer = null;
    }
    modifyTabState(t.tab);
}

/* Initialize tabs that may be open already.
 * Occurs at updates of the plugin
 */
for (tab of tabs) {
	onActivate(tab);
}