const {Cu} = require("chrome");
const {OS} = Cu.import("resource://gre/modules/osfile.jsm", {});
var tabs = require("sdk/tabs");
var sys = require("sdk/system");
var pref = require('sdk/simple-prefs');
var {ActionButton} = require("sdk/ui/button/action");
var {setInterval, clearInterval} = require("sdk/timers");

tabs.on("ready", onReadyState);
tabs.on("close", deregisterIntervalTimer);
tabs.on('activate', onActivate);
pref.on('fileCheckRate', onPref_fileCheckRate)

var toggleButtonDisabledText = "Enable auto-(file)update for this tab";
var toggleButtonEnabledText = "Disable auto-(file)update for this tab";
var toggleButtonOffText = "Only works with local files!";

var fileCheckRate = pref.prefs['fileCheckRate'];

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

function onPref_fileCheckRate() {
	var newValue = pref.prefs['fileCheckRate'];
	
	if (newValue < 50)
		newValue = pref.prefs['fileCheckRate'] = 50;
	else if (newValue > 2147000000)
		newValue = pref.prefs['fileCheckRate'] = 2147000000;
	
	fileCheckRate = newValue;
	updateTimerIntevall();
}

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

function deregisterIntervalTimer(tab) {
    var t = getActiveTarget(tab.id);
    if (t != null) {
        clearInterval(t.intervalTimer);
        activeTargets.splice(activeTargets.indexOf(t), 1);
    }
}

function updateTimerIntevall() {
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

function getActiveTarget(tabID) {
    for (t of activeTargets) {
        if (t.tab.id == tabID)
            return t;
    }
    return null;
}

// Mozilla is kind of stupid and call onClose() when moving a tab to a new window
// after this, they don't call onReady() and as such we will destroy the target
// not creating a new one - resulting in t being resolved to null in this case.
// To work around this, we simply call onReady() our selvs
function onActivate(tab) {
	var t = getActiveTarget(tab.id);
	if (t == null) // Goddamnit Mozilla!
		onReadyState(tab);
	else
		modifyTabState(tab);
}

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

// Initialize tabs that may be open already (occurs at updates)
for (tab of tabs) {
	onActivate(tab);
}