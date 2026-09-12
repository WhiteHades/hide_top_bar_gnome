import Gio from 'gi://Gio';
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const read = p => new TextDecoder().decode(Gio.File.new_for_path(p).load_contents(null)[1]);
let calls = 0;
const panel = {y: 200, x: 0, width: 1920, height: 32, visible: true,
    get_pivot_point: () => [0,0], remove_all_transitions() {},
    ease(p) { calls++; this.y=p.y; p.onComplete?.(); }, hide() {this.visible=false;}, show(){this.visible=true;}};
const Main = {messageTray:{},layoutManager:{panelBox:panel,primaryMonitor:{y:200},hotCorners:[]},
    overview:{visible:false,_overview:{_controls:{_searchEntryBin:null}}},panel:{menuManager:{activeMenu:null}}};
const code=read('panelVisibilityManager.js').replace(/^import[\s\S]*?;\n/gm,'').replace('export class','class');
const Manager=new Function('Main','Config','Shell','Convenience','Clutter','GLib',code+'\nreturn PanelVisibilityManager;')(
 Main,{PACKAGE_VERSION:'50'},{ActionMode:{NORMAL:1}},{DEBUG(){}},{AnimationMode:{EASE_OUT_QUAD:1}},{});
const m=Object.create(Manager.prototype);
Object.assign(m,{_base_y:200,_settings:{get_boolean:()=>false},_staticBox:{x1:0,x2:1920,y1:200,y2:232},
 _updateHotCorner(){},_updateStaticBox(){},_pointerWatcher:{addWatch(){return {};}}});
globalThis.global={get_pointer:()=>[50,210]};
m.hide(0,'init'); assert(panel.y===168 && !panel.visible,'Panel must hide relative to monitor origin');
const once=calls; m.hide(0,'init'); assert(calls===once,'Repeated hide must not restart animation');
m.show(0,'mouse-enter'); assert(panel.y===200 && panel.visible,'Panel must fully reveal');
m.hide(0,'mouse-left'); assert(panel.visible && m._targetVisible,'Hover guard must preserve visible target');
let removed=0,destroyed=0;
Object.assign(m,{_pointerListener:{},_pointerWatcher:{_removeWatch(){removed++;}},
 _panelBarrier:{destroy(){destroyed++;}},_panelPressure:{removeBarrier(){},destroy(){destroyed++;}}});
m._disablePressureBarrier();m._disablePressureBarrier();
assert(removed===1 && destroyed===2,'Barrier/watch disposal must be complete and idempotent');
// Constructor must not hand fullscreen visibility back to the shell while hover owns it.
assert(code.includes('affectsStruts: false,\n            trackFullscreen: false'),'Fullscreen chrome conflict returned');
assert((code.match(/new Convenience.GlobalSignalsHandler/g)||[]).length===1,'Settings signal owner overwritten');
for(const name of ['extension.js','convenience.js','intellihide.js','desktopIconsIntegration.js','prefs.js']) {
 const source=read(name).replace(/^import[\s\S]*?;\n/gm,'').replace(/export default class/g,'class').replace(/export (class|const|function)/g,'$1');
 new Function(source.replaceAll('import.meta.url', '"file:///test"')); 
}
print('PASS: reveal/hide geometry, repeated events, hover guard, barrier disposal, fullscreen tracking, signal ownership, JS parsing');
