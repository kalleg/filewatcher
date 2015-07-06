const {Cu} = require("chrome");
const {OS} = Cu.import("resource://gre/modules/osfile.jsm", {});
var tabs = require("sdk/tabs");
var sys = require("sdk/system");
var { ActionButton } = require("sdk/ui/button/action");
var {setInterval, clearInterval} = require("sdk/timers");

tabs.on("ready", onReadyState);
tabs.on("close", deregisterIntervalTimer);
tabs.on('activate', modifyTabState);

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

var activeTargets = [];

function onReadyState(tab) {
    if (tab.url.indexOf("file://") != -1) {
        if (getActiveTarget(tab.id) == null) {
            activeTargets.push({tab: tab, intervalTimer: null, lastMod: new Date(), lastSize: -1});
            activeTargets[activeTargets.length-1].intervalTimer = 
            setInterval(
                function() {
                   checkFile(activeTargets[activeTargets.length-1]) 
                }, 666);
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

        if (newSize > target.lastSize) {
            target.tab.reload();
            target.lastSize = newSize;
        }
        else if (newDate > target.lastMod) {
            target.tab.reload();
            target.lastMod = newDate;
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


function getActiveTarget(tabID) {
    for (t of activeTargets) {
        if (t.tab.id == tabID)
            return t;
    }
    return null;
}

function modifyTabState() {
    if (tabs.activeTab.url.indexOf("file:///") != -1) {
        toggleButton.disabled = false;
        var t = getActiveTarget(tabs.activeTab.id);

        if (t.intervalTimer == null) {
            toggleButton.label = toggleButtonDisabledText;
            toggleButton.icon = inactiveIcons;
        }
        else {
            toggleButton.label = toggleButtonEnabledText;
            toggleButton.icon = activeIcons;
        }
    }
    else {
        toggleButton.disabled = true;
        toggleButton.label = toggleButtonOffText;
        toggleButton.icon = inactiveIcons;
    }
}

var toggleButton = ActionButton({
    id: "toggleButton",
    label: "Error message (;",
    icon: inactiveIcons,
    disabled: true,
    onClick: function(state) {
        toggleTimer(state);
    }
});

function toggleTimer(state) {
    var t = getActiveTarget(tabs.activeTab.id);
    if (t.intervalTimer == null && t != null) {
        t.intervalTimer = setInterval(
            function() {
                checkFile(t);
            }, 1000);
    }
    else if (t != null) {
        clearInterval(t.intervalTimer);
        t.intervalTimer = null;
    }
    modifyTabState(t.tab);
}