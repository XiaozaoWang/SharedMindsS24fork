import { SphereGeometry, DoubleSide, Texture, PlaneGeometry, Mesh, MeshBasicMaterial, TextureLoader, CylinderGeometry, PerspectiveCamera, Scene, Raycaster, WebGLRenderer, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as FB from './firebaseStuffFramesAuthUpload.js';
import { initMoveCameraWithMouse, initHTML } from './interaction.js';



let camera, scene, renderer;
let texturesThatNeedUpdating = [];  //for updating textures
let myObjectsByThreeID = {}  //for converting from three.js object to my JSON object
let clickableMeshes = []; //for use with raycasting
let myObjectsByFirebaseKey = {}; //for converting from firebase key to my JSON object

let currentFrame = 1;
let exampleName = "SharedMindsExampleSequenceAuth";
let user = FB.initFirebase();
if (user) initAll();  //don't show much if the have not logged in yet.

export function initAll() {
    //if it doesn't already exist
    if (!document.getElementById("THREEcontainer")) {
        initHTML();
        init3D();
    }
    listenForChangesInNewFrame(null, currentFrame);
}

// Create a new GLTFLoader instance to load the 3D model
const loader = new GLTFLoader();
// Function to load and add a duck to the scene
function creatNewModel(url, pos) {
    console.log("creatNewModel", url);
    loader.load(url, function (gltf) {
        const model = gltf.scene;
        model.scale.set(5, 5, 5);
        model.position.set(pos.x, pos.y, pos.z);
        scene.add(model);
        thingsThatNeedSpinning.push(model);
    });
}

export function nextFrame() {
    let oldFrame = currentFrame;
    currentFrame++;
    let currentFrameDisplay = document.getElementById("currentFrameDisplay");
    currentFrameDisplay.textContent = `Current Frame: ${currentFrame}`;
    listenForChangesInNewFrame(oldFrame, currentFrame);
}

export function previousFrame() {
    let oldFrame = currentFrame;
    if (currentFrame > 1) {
        currentFrame--;
        let currentFrameDisplay = document.getElementById("currentFrameDisplay");
        currentFrameDisplay.textContent = `Current Frame: ${currentFrame}`;
        listenForChangesInNewFrame(oldFrame, currentFrame);
    }
}


export function moveObject(selectedObject, x, y) {
    let pos = project2DCoordsInto3D(100, { x: x, y: y });
    const updates = { position: pos };
    let title = document.getElementById("title").value;
    const dbPath = exampleName + "/" + title + "/frames/" + currentFrame;
    FB.updateJSONFieldInFirebase(dbPath, selectedObject.firebaseKey, updates);
}

function clearLocalScene() {
    for (let key in myObjectsByFirebaseKey) {
        let thisObject = myObjectsByFirebaseKey[key];
        scene.remove(thisObject.mesh);
        console.log("removing", thisObject);
    }
    texturesThatNeedUpdating = [];  //for updating textures
    myObjectsByThreeID = {}  //for converting from three.js object to my JSON object
    clickableMeshes = []; //for use with raycasting
    myObjectsByFirebaseKey = {}; //for converting from firebase key to my JSON object
}


function listenForChangesInNewFrame(oldFrame, currentFrame) {
    let title = document.getElementById("title").value;
    if (oldFrame) FB.unSubscribeToData(exampleName + "/" + title + "/frames/" + oldFrame);
    clearLocalScene();
    FB.subscribeToData(exampleName + "/" + title + "/frames/" + currentFrame, (reaction, data, key) => {
        if (data) {
            if (reaction === "added") {
                if (data.type === "text") {
                    createNewText(data, key);
                } else if (data.type === "image") {
                    let img = new Image();  //create a new image
                    img.onload = function () {
                        let posInWorld = data.position;
                        createNewImage(img, posInWorld, key);
                    }
                    img.src = data.base64;
                } else if (data.type === "p5ParticleSystem") {
                    createNewP5(data, key);
                } else if (data.type === "3DModel") {
                    creatNewModel(data.url, data.position);
                }
            } else if (reaction === "changed") {
                console.log("changed", data);
                let thisObject = myObjectsByFirebaseKey[key];
                if (thisObject) {
                    if (data.type === "text") {
                        thisObject.text = data.text;
                        thisObject.position = data.position;
                        redrawText(thisObject);
                    } else if (data.type === "image") {
                        let img = new Image();  //create a new image
                        img.onload = function () {
                            thisObject.img = img;
                            thisObject.position = data.position;
                            redrawImage(thisObject);
                        }
                        img.src = data.base64;

                    } else if (data.type === "p5ParticleSystem") {
                        thisObject.position = data.position;
                        redrawP5(thisObject);
                    }
                }
            } else if (reaction === "removed") {
                console.log("removed", data);
                let thisObject = myObjectsByFirebaseKey[key];
                if (thisObject) {
                    scene.remove(thisObject.mesh);
                    delete myObjectsByThreeID[thisObject.threeID];
                }
            }
        }; //get notified if anything changes in this folder
    });
}

export function addTextRemote(text, mouse) {
    let title = document.getElementById("title").value;
    const pos = project2DCoordsInto3D(150 - camera.fov, mouse);
    let user = FB.getUser();
    if (!user) return;
    let userName = user.displayName.split(" ")[0];
    if (!userName) userName = user.email.split("@")[0].split(" ")[0];
    const data = { type: "text", position: { x: pos.x, y: pos.y, z: pos.z }, text: text, userID: user.uid, userName: user.displayName };
    let folder = exampleName + "/" + title + "/frames/" + currentFrame;
    console.log("Entered Text, Send to Firebase", folder, title, exampleName);
    FB.addNewThingToFirebase(folder, data);//put empty for the key when you are making a new thing.
}

export function add3DModelRemote(file, mouse, filename) {
    //  console.log("add3DModelRemote", file);
    let title = document.getElementById("title").value;
    let directory = exampleName + "/" + title + "/frames/" + currentFrame + "/";
    const pos = project2DCoordsInto3D(150 - camera.fov, mouse);
    FB.uploadFile(directory, file, filename, (url) => {
        console.log("Uploaded 3D Model");
        let user = FB.getUser();
        if (!user) return;
        let userName = user.displayName;
        if (!userName) userName = user.email.split("@")[0];
        const data = { type: "3DModel", url: url, position: { x: pos.x, y: pos.y, z: pos.z }, userName: user.displayName };
        let folder = exampleName + "/" + title + "/frames/" + currentFrame;
        console.log("Entered 3DModel, Send to Firebase", folder, title, exampleName);
        FB.addNewThingToFirebase(folder, data);//put empty for the key when you are making a new thing.
    });
}

export function addImageRemote(b64, mouse) {
    let title = document.getElementById("title").value;
    const pos = project2DCoordsInto3D(150 - camera.fov, mouse);
    let user = FB.getUser();
    if (!user) return;
    let userName = user.displayName;
    if (!userName) userName = user.email.split("@")[0];
    const data = { type: "image", position: { x: pos.x, y: pos.y, z: pos.z }, base64: b64, userName: user.displayName };
    let folder = exampleName + "/" + title + "/frames/" + currentFrame;
    console.log("Entered Image, Send to Firebase", folder, title, exampleName);
    FB.addNewThingToFirebase(folder, data);//put empty for the key when you are making a new thing.
}

export function addP5Remote(mouse) {
    let title = document.getElementById("title").value;
    const pos = project2DCoordsInto3D(150 - camera.fov, mouse);
    let user = FB.getUser();
    if (!user) return;
    let userName = user.displayName;
    if (!userName) userName = user.email.split("@")[0];
    const data = { type: "p5ParticleSystem", position: { x: pos.x, y: pos.y, z: pos.z } };
    let folder = exampleName + "/" + title + "/frames/" + currentFrame;
    console.log("Entered Image, Send to Firebase", folder, title, exampleName);
    FB.addNewThingToFirebase(folder, data);//put empty for the key when you are making a new thing.
}

export function findObjectUnderMouse(x, y) {
    let raycaster = new Raycaster(); // create once
    //var mouse = new Vector2(); // create once
    let mouse = {};
    mouse.x = (x / renderer.domElement.clientWidth) * 2 - 1;
    mouse.y = - (y / renderer.domElement.clientHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    let intersects = raycaster.intersectObjects(clickableMeshes, false);

    // if there is one (or more) intersections
    let hitObject = null;
    if (intersects.length > 0) {
        let hitMesh = intersects[0].object; //closest objec
        hitObject = myObjectsByThreeID[hitMesh.uuid]; //use look up table assoc array

    }
    return hitObject;
    //console.log("Hit ON", hitMesh);
}

export function project2DCoordsInto3D(distance, mouse) {
    let vector = new Vector3();
    vector.set(
        (mouse.x / window.innerWidth) * 2 - 1,
        - (mouse.y / window.innerHeight) * 2 + 1,
        0
    );
    //vector.set(0, 0, 0); //would be middle of the screen where input box is
    vector.unproject(camera);
    vector.multiplyScalar(distance)
    return vector;
}

function init3D() {
    scene = new Scene();
    camera = new PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.target = new Vector3(0, 0, 0);  //mouse controls move this around and camera looks at it 
    renderer = new WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    ///document.body.appendChild(renderer.domElement);

    //this puts the three.js stuff in a particular div
    document.getElementById('THREEcontainer').appendChild(renderer.domElement)

    let bgGeometery = new SphereGeometry(1000, 60, 40);
    // let bgGeometery = new CylinderGeometry(725, 725, 1000, 10, 10, true)
    bgGeometery.scale(-1, 1, 1);
    // has to be power of 2 like (4096 x 2048) or(8192x4096).  i think it goes upside down because texture is not right size
    let panotexture = new TextureLoader().load("itp.jpg");
    // let material = new MeshBasicMaterial({ map: panotexture, transparent: true,   alphaTest: 0.02,opacity: 0.3});
    let backMaterial = new MeshBasicMaterial({ map: panotexture });
    let back = new Mesh(bgGeometery, backMaterial);
    scene.add(back);

    initMoveCameraWithMouse(camera, renderer);

    camera.position.z = 0;
    animate();
}

function animate() {
    for (let i = 0; i < texturesThatNeedUpdating.length; i++) {
        texturesThatNeedUpdating[i].texture.needsUpdate = true;
    }
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}




function createNewImage(img, posInWorld, firebaseKey) {

    let canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    let context = canvas.getContext("2d");

    let texture = new Texture(canvas);
    texture.needsUpdate = true;
    let material = new MeshBasicMaterial({ map: texture, transparent: true, side: DoubleSide, alphaTest: 0.5 });
    let geo = new PlaneGeometry(canvas.width / canvas.width, canvas.height / canvas.width);
    let mesh = new Mesh(geo, material);

    mesh.lookAt(0, 0, 0);
    mesh.scale.set(10, 10, 10);
    scene.add(mesh);
    let base64 = canvas.toDataURL();
    let thisObject = {
        type: "image", firebaseKey: firebaseKey, position: posInWorld, context: context, texture: texture, img: img, base64: base64, threeID: mesh.uuid, position: posInWorld, canvas: canvas, mesh: mesh, texture: texture
    };
    redrawImage(thisObject);
    clickableMeshes.push(mesh);
    myObjectsByThreeID[mesh.uuid] = thisObject;
    myObjectsByFirebaseKey[firebaseKey] = thisObject;
}

function redrawImage(object) {
    let img = object.img;
    object.context.drawImage(img, 0, 0);
    let fontSize = Math.max(12);
    object.context.font = fontSize + "pt Arial";
    object.context.textAlign = "center";
    object.context.fillStyle = "red";
    object.context.fillText(object.userName, object.canvas.width / 2, object.canvas.height - 30);
    object.mesh.position.x = object.position.x;
    object.mesh.position.y = object.position.y;
    object.mesh.position.z = object.position.z;
    object.mesh.lookAt(0, 0, 0);
    object.texture.needsUpdate = true;
}


function createNewText(data, firebaseKey) {
    let text_msg = data.text;
    let posInWorld = data.position;
    let canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;

    let texture = new Texture(canvas);

    let material = new MeshBasicMaterial({ map: texture, transparent: true, side: DoubleSide, alphaTest: 0.5 });
    let geo = new PlaneGeometry(1, 1);
    let mesh = new Mesh(geo, material);
    mesh.lookAt(0, 0, 0);
    mesh.scale.set(10, 10, 10);
    scene.add(mesh);
    let thisObject = { type: "text", firebaseKey: firebaseKey, threeID: mesh.uuid, text: text_msg, position: posInWorld, canvas: canvas, mesh: mesh, texture: texture, userName: data.userName };
    redrawText(thisObject);
    clickableMeshes.push(mesh);
    myObjectsByThreeID[mesh.uuid] = thisObject;
    myObjectsByFirebaseKey[firebaseKey] = thisObject;
}

function redrawText(thisObject) {
    let canvas = thisObject.canvas;
    let context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    let fontSize = 24;
    context.font = fontSize + "pt Arial";
    context.textAlign = "center";
    context.fillStyle = "red";
    context.fillText(thisObject.userName, canvas.width / 2, canvas.height - 20);
    let words = thisObject.text.split(" ");
    for (let i = 0; i < words.length; i++) {
        context.fillText(words[i], canvas.width / 2, (i + 1) * fontSize);
    }

    thisObject.texture.needsUpdate = true;
    thisObject.mesh.position.x = thisObject.position.x;
    thisObject.mesh.position.y = thisObject.position.y;
    thisObject.mesh.position.z = thisObject.position.z;
    thisObject.mesh.lookAt(0, 0, 0);
    thisObject.texture.needsUpdate = true;
}

function birthP5Object(w, h) {
    let sketch = function (p) {
        let particles = [];
        let myCanvas;
        p.setup = function () {
            myCanvas = p.createCanvas(w, h);

        };
        p.getP5Canvas = function () {
            return myCanvas;
        }

        p.draw = function () {
            p.clear();
            for (let i = 0; i < 5; i++) {
                let p = new Particle();
                particles.push(p);
            }
            for (let i = particles.length - 1; i >= 0; i--) {
                particles[i].update();
                particles[i].show();
                if (particles[i].finished()) {
                    // remove this particle
                    particles.splice(i, 1);
                }
            }
        };

        class Particle {
            constructor() {
                this.x = p.width / 2;
                this.y = p.height / 2;
                this.vx = p.random(-1, 1);
                this.vy = p.random(-4, 1);
                this.alpha = 255;
            }
            finished() {
                return this.alpha < 0;
            }
            update() {
                this.x += this.vx;
                this.y += this.vy;
                this.alpha -= 10;
            }
            show() {
                p.noStroke();
                p.fill(255, 0, 255, this.alpha);
                p.ellipse(this.x, this.y, 5);
            }
        }
    };
    return new p5(sketch);
}

function createNewP5(data, firebaseKey) {  //called from double click
    let newP5 = birthP5Object(200, 200);
    //pull the p5 canvas out of sketch 
    //and then regular (elt) js canvas out of special p5 canvas
    let myCanvas = newP5.getP5Canvas();
    let canvas = myCanvas.elt;

    let texture = new Texture(canvas);
    texture.needsUpdate = true;
    let material = new MeshBasicMaterial({ map: texture, transparent: true, side: DoubleSide, alphaTest: 0.5 });
    let geo = new PlaneGeometry(canvas.width / canvas.width, canvas.height / canvas.width);
    let mesh = new Mesh(geo, material);
    mesh.scale.set(10, 10, 10);
    scene.add(mesh);

    let thisObject = { type: "p5ParticleSystem", firebaseKey: firebaseKey, threeID: mesh.uuid, position: data.position, canvas: canvas, mesh: mesh, texture: texture };
    redrawP5(thisObject);
    texturesThatNeedUpdating.push(thisObject);
    clickableMeshes.push(mesh);
    mesh.lookAt(0, 0, 0);
    myObjectsByThreeID[mesh.uuid] = thisObject;
    myObjectsByFirebaseKey[firebaseKey] = thisObject;
}

function redrawP5(thisObject) {
    thisObject.mesh.position.x = thisObject.position.x;
    thisObject.mesh.position.y = thisObject.position.y;
    thisObject.mesh.position.z = thisObject.position.z;
    thisObject.mesh.lookAt(0, 0, 0);
    thisObject.texture.needsUpdate = true;
}





