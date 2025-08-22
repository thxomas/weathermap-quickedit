# weathermap-quickedit
A modern quick editor for existing Network Weathermap. Allows moving nodes and vias and editing basic properties.
# Why ?
[Network Weathermap](http://www.network-weathermap.com/) by Howard Jones is a popular tool among telcos, netadmins and sysadmins to display monitoring data in an efficient way whether standalone or integrated with Cacti.
However the editor included with the tool has limitations when maps go big.
This project is an attempt to make it easier to work with complex maps.
# How ?
I started this accidentally by asking a GPT for a config file parser and then went on bulding on it.\
The project has two main parts :
- A Node.js server part : to parse config files into JSON and back
- A Javascript-enabled webpage to display and interact with the objects
# What ?
This is an early work-in-progress tool with many POCs, dirty unoptimised code and little error checking.\
Currently it can :
- Load a .conf file from a remote directory
- Display Nodes (label & icon)
- Display Links (supports compass-point offsets)
- Move Nodes and Vias by dragging them
- Display object properties (readonly)
- Save the .conf file, preserving unedited/unsupported properties
#What Not ?
- The editor cannot create new objects
- The tool is not (yet) integrated with Cacti as a plugin
# How to try ?
- Clone the repository
- cd into it
- add your .conf files into the `configs/` directory (`map.conf` is loaded by default at start)
- add some pictures/icons into `images/` directory
- start the server `node server.js`
- Connect to http://localhost:3000
- Have fun !

