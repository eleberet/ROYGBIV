var ModelCreatorGUIHandler = function(){

}

ModelCreatorGUIHandler.prototype.show = function(modelName){
  selectionHandler.resetCurrentSelection();
  guiHandler.hideAll();
  this.hiddenEngineObjects = [];
  for (var i = 0; i<scene.children.length; i++){
    var child = scene.children[i];
    if (child.visible){
      child.visible = false;
      this.hiddenEngineObjects.push(child);
    }
  }
  activeControl = new OrbitControls({maxRadius: 2000, zoomDelta: 10});
  activeControl.onActivated();

  terminal.clear();
  terminal.disable();
  terminal.printInfo(Text.LOADING_MODELS);

  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/getModels", true);
  xhr.setRequestHeader("Content-type", "application/json");
  xhr.onreadystatechange = function(){
    if (xhr.readyState == 4 && xhr.status == 200){
      var resp = JSON.parse(xhr.responseText);

      if (resp.length == 0){
        modelCreatorGUIHandler.close(Text.NO_VALID_MODELS_UNDER_MODELS_FOLDER, true);
        return;
      }

      modelCreatorGUIHandler.renderControls(resp, 0, modelName);
    }
  }
  xhr.send(JSON.stringify({acceptedTextureSize: ACCEPTED_TEXTURE_SIZE}));
}

ModelCreatorGUIHandler.prototype.close = function(message, isError){
  guiHandler.hideAll();
  if (this.hiddenEngineObjects){
    for (var i = 0; i<this.hiddenEngineObjects.length; i++){
      this.hiddenEngineObjects[i].visible = true;
    }
  }

  terminal.clear();
  terminal.enable();
  if (!isError){
    terminal.printInfo(message);
  }else{
    terminal.printError(message);
  }
  activeControl = new FreeControls({});
  activeControl.onActivated();
  camera.quaternion.set(0, 0, 0, 1);
  camera.position.set(initialCameraX, initialCameraY, initialCameraZ);

  if (this.modelMesh){
    scene.remove(this.modelMesh);
    delete this.modelMesh;
    delete this.model;
  }
}

ModelCreatorGUIHandler.prototype.renderControls = function(allModels, index, modelName){
  terminal.clear();
  terminal.printInfo(Text.LOADING_MODEL);

  var modelToLoad = allModels[index];
  modelLoader.loadModel(modelToLoad.folder, modelToLoad.obj, modelToLoad.mtl, function(model){
    var allFolders = [];
    for (var i = 0; i < allModels.length; i ++){
      allFolders.push(allModels[i].folder);
    }

    var params = {
      "Folder": allFolders[index],
      "Enable custom textures": false,
      "Scale": 1,
      "Done": function(){
        var folderName = modelCreatorGUIHandler.model.info.folderName;
        for (var mName in models){
          if (models[mName].info.folderName == folderName){
            terminal.clear();
            terminal.printError(Text.ANOTHER_MODEL_OF_SAME_FOLDER_EXISTS.replace(Text.PARAM1, mName));
            return;
          }
        }
        models[modelName] = modelCreatorGUIHandler.model;
        delete modelCreatorGUIHandler.model;
        modelCreatorGUIHandler.close(Text.COMPRESSING_TEXTURE, false);
        terminal.disable();
        textureAtlasHandler.onTexturePackChange(function(){
          terminal.clear();
          terminal.printInfo(Text.MODEL_CREATED);
          terminal.enable();
        }, function(){
          terminal.clear();
          terminal.printError(Text.ERROR_HAPPENED_COMPRESSING_TEXTURE_ATLAS);
          delete models[modelName];
          terminal.enable();
        }, true);
      },
      "Cancel": function(){
        modelCreatorGUIHandler.close(Text.OPERATION_CANCELLED, false);
      }
    };

    modelCreatorGUIHandler.renderModel(model, modelName, allFolders[index], allModels[index].arModelNames, function(){
      terminal.clear();
      terminal.printInfo(Text.MODEL_LOADED);

      if (guiHandler.datGuiModelCreation){
        guiHandler.removeControllers(guiHandler.datGuiModelCreation);
      }else{
        guiHandler.datGuiModelCreation = new dat.GUI({hideable: false, width: 420});
      }

      var folderController, scaleController, customTextureController;

      folderController = guiHandler.datGuiModelCreation.add(params, "Folder", allFolders).onChange(function(val){
        guiHandler.disableController(folderController);
        guiHandler.disableController(scaleController);
        guiHandler.disableController(customTextureController);
        modelCreatorGUIHandler.renderControls(allModels, allFolders.indexOf(val), modelName);
      });
      customTextureController = guiHandler.datGuiModelCreation.add(params, "Enable custom textures").onChange(function(val){
        terminal.clear();
        if (!modelCreatorGUIHandler.model.supportsCustomTextures()){
          params["Enable custom textures"] = false;
          terminal.printError(Text.THIS_MODEL_DOES_NOT_SUPPORT_CUSTOM_TEXTURES);
          return;
        }
        if (val){
          modelCreatorGUIHandler.model.enableCustomTextures();
        }else{
          modelCreatorGUIHandler.model.disableCustomTextures();
        }

        terminal.printInfo(val? Text.CUSTOM_TEXTURES_ENABLED_FOR_THIS_MODEL: Text.CUSTOM_TEXTURES_DISABLED_FOR_THIS_MODEL);
      }).listen();
      scaleController = guiHandler.datGuiModelCreation.add(params, "Scale").min(0.1).max(100).step(0.1).onChange(function(val){
        modelCreatorGUIHandler.modelMesh.scale.set(val, val, val);
      });
      guiHandler.datGuiModelCreation.add(params, "Done");
      guiHandler.datGuiModelCreation.add(params, "Cancel");
    });
  }, function(){
    modelCreatorGUIHandler.close(Text.ERROR_HAPPENED_LOADING_MODEL_FROM_FOLDER.replace(Text.PARAM1, modelToLoad.folder), true);
  });
}

ModelCreatorGUIHandler.prototype.renderModel = function(model, name, folderName, arModelNames, onReady){
  if (this.modelMesh){
    scene.remove(this.modelMesh);
  }

  var pseudoGeometry = new THREE.Geometry();

  var texturesObj = {};
  var childInfos = [];

  var boundingBox = new THREE.Box3();

  var hasNormalMap = false;

  for (var i = 0; i < model.children.length; i ++){
    var childMesh = model.children[i];
    var childInfo = {
      name: childMesh.name,
      colorR: childMesh.material.color.r,
      colorG: childMesh.material.color.g,
      colorB: childMesh.material.color.b
    };

    var childBB = new THREE.Box3().setFromObject(childMesh);
    childInfo.bb = {
      minX: childBB.min.x,
      minY: childBB.min.y,
      minZ: childBB.min.z,
      maxX: childBB.max.x,
      maxY: childBB.max.y,
      maxZ: childBB.max.z
    };

    var normalGeometry = new THREE.Geometry().fromBufferGeometry(childMesh.geometry);
    for (var i2 = 0; i2 < normalGeometry.faces.length; i2++){
      normalGeometry.faces[i2].materialIndex = i;
    }

    childMesh.updateMatrix(true);
    pseudoGeometry.merge(normalGeometry, childMesh.matrix);

    if (childMesh.material.map){
      var tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = childMesh.material.map.image.width;
      tmpCanvas.height = childMesh.material.map.image.height;
      tmpCanvas.getContext("2d").drawImage(childMesh.material.map.image, 0, 0);
      texturesObj[childMesh.material.map.image.src] = new THREE.CanvasTexture(tmpCanvas);
      childInfo.diffuseTextureURL = childMesh.material.map.image.src;
      var diffuseTextureID = null;
      for (var i2 = 0; i2 < childInfos.length; i2 ++){
        if (childInfos[i2].diffuseTextureURL == childMesh.material.map.image.src){
          diffuseTextureID = childInfos[i2].diffuseTextureID;
          break;
        }
      }
      if (!diffuseTextureID){
        childInfo.diffuseTextureID = generateUUID();
      }else{
        childInfo.diffuseTextureID = diffuseTextureID;
      }
    }

    if (childMesh.material.normalMap){
      hasNormalMap = true;
      var tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = childMesh.material.normalMap.image.width;
      tmpCanvas.height = childMesh.material.normalMap.image.height;
      tmpCanvas.getContext("2d").drawImage(childMesh.material.normalMap.image, 0, 0);
      texturesObj[childMesh.material.normalMap.image.src] = new THREE.CanvasTexture(tmpCanvas);
      childInfo.normalTextureURL = childMesh.material.normalMap.image.src;
      var normalTextureID = null;
      for (var i2 = 0; i2 < childInfos.length; i2 ++){
        if (childInfos[i2].normalTextureURL == childMesh.material.normalMap.image.src){
          normalTextureID = childInfos[i2].normalTextureID;
          break;
        }
      }
      if (!normalTextureID){
        childInfo.normalTextureID = generateUUID();
      }else{
        childInfo.normalTextureID = normalTextureID;
      }
    }

    childInfos.push(childInfo);
  }

  var textureMerger = null;
  if (Object.keys(texturesObj).length > 0){
    textureMerger = new TextureMerger(texturesObj);
  }

  var vertices = pseudoGeometry.vertices;
  var faceVertexUVs = pseudoGeometry.faceVertexUvs[0];

  var positions = [];
  var normals = [];
  var colors = [];
  var uvs = [];
  var diffuseUVs = [];
  var normalUVs = [];

  var materialIndices = [];

  for (var i = 0; i<pseudoGeometry.faces.length; i++){
    var face = pseudoGeometry.faces[i];
    var childMesh = model.children[face.materialIndex];

    materialIndices.push(face.materialIndex);
    materialIndices.push(face.materialIndex);
    materialIndices.push(face.materialIndex);

    var a = face.a;
    var b = face.b;
    var c = face.c;

    var vertex1 = vertices[a];
    var vertex2 = vertices[b];
    var vertex3 = vertices[c];

    boundingBox.expandByPoint(vertex1);
    boundingBox.expandByPoint(vertex2);
    boundingBox.expandByPoint(vertex3);

    var vertexNormals = face.vertexNormals;
    var vertexNormal1 = vertexNormals[0];
    var vertexNormal2 = vertexNormals[1];
    var vertexNormal3 = vertexNormals[2];

    var color = childMesh.material.color;

    var uv1 = null;
    var uv2 = null;
    var uv3 = null;

    if (textureMerger){
      uv1 = faceVertexUVs[i][0];
      uv2 = faceVertexUVs[i][1];
      uv3 = faceVertexUVs[i][2];
    }else{
      REUSABLE_2_VECTOR.set(0, 0);
      uv1 = REUSABLE_2_VECTOR;
      uv2 = REUSABLE_2_VECTOR;
      uv3 = REUSABLE_2_VECTOR;
    }

    this.triplePush(positions, vertex1, vertex2, vertex3, "xyz");
    this.triplePush(normals, vertexNormal1, vertexNormal2, vertexNormal3, "xyz");
    this.triplePush(colors, color, color, color, "rgb");
    this.triplePush(uvs, uv1, uv2, uv3, "xy");

    if (childMesh.material.map){
      var uvInfo = textureMerger.ranges[childMesh.material.map.image.src];
      this.quadruplePush(diffuseUVs, uvInfo.startU, uvInfo.startV, uvInfo.endU, uvInfo.endV, "number");
    }else{
      this.quadruplePush(diffuseUVs, -100, -100, -100, -100, "number");
    }

    if (childMesh.material.normalMap){
      var uvInfo = textureMerger.ranges[childMesh.material.normalMap.image.src];
      this.quadruplePush(normalUVs, uvInfo.startU, uvInfo.startV, uvInfo.endU, uvInfo.endV, "number");
    }else if (hasNormalMap){
      this.quadruplePush(normalUVs, -100, -100, -100, -100, "number");
    }
  }

  modelCreatorGUIHandler.model = new Model({
    name: name,
    folderName: folderName,
    childInfos: childInfos,
    originalBoundingBox: boundingBox,
    hasNormalMap: hasNormalMap
  }, texturesObj, positions, normals, uvs, colors, diffuseUVs, normalUVs, materialIndices);

  modelCreatorGUIHandler.model.setARModelNames(arModelNames);

  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/createRMFFile?folderName=" + folderName, true);
  xhr.overrideMimeType("application/octet-stream");
  xhr.onreadystatechange = function(){
    if (xhr.readyState == 4 && xhr.status == 200){
      modelCreatorGUIHandler.modelMesh = new MeshGenerator(modelCreatorGUIHandler.model.geometry).generateModelMesh(modelCreatorGUIHandler.model, textureMerger? textureMerger.mergedTexture: null);
      scene.add(modelCreatorGUIHandler.modelMesh);
      onReady();
    }
  }

  var generated = rmfHandler.generate(positions, normals, uvs, modelCreatorGUIHandler.model.indexedMaterialIndices);
  xhr.send(generated.rmf);

  var xhr2 = new XMLHttpRequest();
  xhr2.open("POST", "/createRMIFFile?folderName=" + folderName, true);
  xhr2.overrideMimeType("application/octet-stream");
  xhr2.send(generated.rmif);
}

ModelCreatorGUIHandler.prototype.triplePush = function(ary, obj1, obj2, obj3, type){
  if (type == "xyz"){
    ary.push(obj1.x);
    ary.push(obj1.y);
    ary.push(obj1.z);

    ary.push(obj2.x);
    ary.push(obj2.y);
    ary.push(obj2.z);

    ary.push(obj3.x);
    ary.push(obj3.y);
    ary.push(obj3.z);
  }else if (type === "rgb"){
    ary.push(obj1.r);
    ary.push(obj1.g);
    ary.push(obj1.b);

    ary.push(obj2.r);
    ary.push(obj2.g);
    ary.push(obj2.b);

    ary.push(obj3.r);
    ary.push(obj3.g);
    ary.push(obj3.b);
  }else if (type === "xy"){
    ary.push(obj1.x);
    ary.push(obj1.y);

    ary.push(obj2.x);
    ary.push(obj2.y);

    ary.push(obj3.x);
    ary.push(obj3.y);
  }
}

ModelCreatorGUIHandler.prototype.quadruplePush = function(ary, obj1, obj2, obj3, obj4, type){
  if (type == "number"){
    ary.push(obj1);
    ary.push(obj2);
    ary.push(obj3);
    ary.push(obj4);

    ary.push(obj1);
    ary.push(obj2);
    ary.push(obj3);
    ary.push(obj4);

    ary.push(obj1);
    ary.push(obj2);
    ary.push(obj3);
    ary.push(obj4);
  }
}