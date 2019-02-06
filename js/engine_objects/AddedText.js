var AddedText = function(font, text, position, color, alpha, characterSize){
  this.font = font;
  this.text = text;
  this.position = position;
  this.color = color;
  this.alpha = alpha;
  this.characterSize = characterSize;
  this.geometry = new THREE.BufferGeometry();
  var strlen = text.length;
  this.strlen = strlen;

  var charIndices = new Float32Array(strlen);
  for (var i = 0; i<strlen; i++){
    charIndices[i] = i;
  }
  this.charIndices = charIndices;
  this.offsetBetweenLines = DEFAULT_OFFSET_BETWEEN_LINES;
  this.offsetBetweenChars = DEFAULT_OFFSET_BETWEEN_CHARS;

  var charIndicesBufferAttribute = new THREE.BufferAttribute(charIndices, 1);
  charIndicesBufferAttribute.setDynamic(false);
  this.geometry.addAttribute('charIndex', charIndicesBufferAttribute);
  this.geometry.setDrawRange(0, strlen);

  var xOffsetsArray = [];
  var yOffsetsArray = [];
  var uvsArray = [];
  for (var i = 0; i<strlen; i++){
    xOffsetsArray.push(0);
    yOffsetsArray.push(0);
    uvsArray.push(new THREE.Vector4());
  }

  this.material = new THREE.RawShaderMaterial({
    vertexShader: ShaderContent.textVertexShader.replace("#define STR_LEN 1", "#define STR_LEN "+strlen),
    fragmentShader: ShaderContent.textFragmentShader,
    vertexColors: THREE.VertexColors,
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: {
      modelViewMatrix: new THREE.Uniform(new THREE.Matrix4()),
      projectionMatrix: GLOBAL_PROJECTION_UNIFORM,
      cameraQuaternion: GLOBAL_CAMERA_QUATERNION_UNIFORM,
      charSize: new THREE.Uniform(characterSize),
      color: new THREE.Uniform(color),
      alpha: new THREE.Uniform(alpha),
      backgroundColor: new THREE.Uniform(new THREE.Color("white")),
      backgroundAlpha: new THREE.Uniform(0.0),
      hasBackgroundColorFlag: new THREE.Uniform(-500.0),
      uvRanges: new THREE.Uniform(uvsArray),
      glyphTexture: this.getGlyphUniform(),
      xOffsets: new THREE.Uniform(xOffsetsArray),
      yOffsets: new THREE.Uniform(yOffsetsArray)
    }
  });
  this.topLeft = new THREE.Vector3(position.x, position.y, position.z);
  this.bottomRight = new THREE.Vector3();
  this.constructText();
  this.handleUVUniform();
  this.mesh = new THREE.Points(this.geometry, this.material);
  this.mesh.position.copy(position);
  this.mesh.frustumCulled = false;
  scene.add(this.mesh);
  this.material.uniforms.modelViewMatrix.value = this.mesh.modelViewMatrix;

  this.tmpObj = {};
  this.line = new THREE.Line3();
  this.matrix4 = new THREE.Matrix4();
}

AddedText.prototype.destroy = function(){
  scene.remove(this.mesh);
  this.material.dispose();
  this.geometry.dispose();
}

AddedText.prototype.constructText = function(){
  var xOffset = 0;
  var yOffset = 0;
  var xOffsets = this.material.uniforms.xOffsets.value;
  var yOffsets = this.material.uniforms.yOffsets.value;
  var xMax = 0;
  var yMin = 0;
  for (var i = 0; i<this.strlen; i++){
    xOffsets[i] = xOffset;
    yOffsets[i] = yOffset;
    if (xOffset > xMax){
      xMax = xOffset;
    }
    if (yOffset < yMin){
      yMin = yOffset;
    }
    if (this.text.charAt(i) == "\n"){
      yOffset -= this.offsetBetweenLines;
      xOffset = 0;
    }else{
      xOffset += this.offsetBetweenChars;
    }
  }
  this.bottomRight.x = this.position.x + xMax;
  this.bottomRight.y = this.position.y + yMin;
  this.bottomRight.z = this.position.z - 1;
}

AddedText.prototype.getGlyphUniform = function(){
  var uuid = this.font.textureMerger.mergedTexture.uuid;
  if (textureUniformCache[uuid]){
    return textureUniformCache[uuid];
  }
  var glyphUniform = new THREE.Uniform(this.font.textureMerger.mergedTexture);
  textureUniformCache[uuid] = glyphUniform;
  return glyphUniform;
}

AddedText.prototype.handleUVUniform = function(){
  var uvRangesArray = this.material.uniforms.uvRanges.value;
  for (var i = 0; i<this.strlen; i++){
    var curChar = this.text.charAt(i);
    var curRange = this.font.textureMerger.ranges[curChar];
    if (curRange){
      uvRangesArray[i].set(
        curRange.startU, curRange.endU, curRange.startV, curRange.endV
      );
    }else{
      uvRangesArray[i].set(-500, -500, -500, -500);
    }
  }
}

AddedText.prototype.setMarginBetweenChars = function(value){
  this.offsetBetweenChars = value;
  this.constructText();
}

AddedText.prototype.setMarginBetweenLines = function(value){
  this.offsetBetweenLines = value;
  this.constructText();
}

AddedText.prototype.setText = function(newText){
  if (newText.length > this.strlen){
    throw new Error("The length of the next text exceeds the length of the old text.");
    return;
  }
  this.text = newText;
  this.constructText();
  this.handleUVUniform();
}

AddedText.prototype.setColor = function(colorString){
  this.material.uniforms.color.value.set(colorString);
}

AddedText.prototype.setAlpha = function(alpha){
  if (alpha > 1){
    alpha = 1;
  }else if (alpha < 0){
    alpha = 0;
  }
  this.material.uniforms.alpha.value = alpha;
}

AddedText.prototype.setBackground = function(backgroundColorString, backgroundAlpha){
  this.material.uniforms.backgroundColor.value.set(backgroundColorString);
  this.material.uniforms.backgroundAlpha.value = backgroundAlpha;
  this.material.uniforms.hasBackgroundColorFlag.value = 500;
}

AddedText.prototype.removeBackground = function(){
  this.material.uniforms.hasBackgroundColorFlag.value = -500;
}

AddedText.prototype.setCharSize = function(value){
  this.material.uniforms.charSize.value = value;
}

AddedText.prototype.handleResize = function(){
  this.setCharSize(this.refCharSize * ((renderer.getCurrentViewport().w / screenResolution)/this.refInnerHeight));
}

AddedText.prototype.calculateCharSize = function(){
  var currentViewport = renderer.getCurrentViewport();
  REUSABLE_VECTOR.copy(this.mesh.position);
  REUSABLE_VECTOR.applyQuaternion(this.mesh.quaternion);
  REUSABLE_VECTOR.applyMatrix4(this.mesh.modelViewMatrix);
  var pointSizePixels =  500 * this.characterSize / REUSABLE_VECTOR.length();
  var verticalFOV = THREE.Math.degToRad(camera.fov);
  var height = 2 * Math.tan(verticalFOV / 2) * this.position.distanceTo(camera.position);
  var width = height * camera.aspect;
  var w = width * pointSizePixels /currentViewport.z;
  var h = height * pointSizePixels / currentViewport.w;
  this.tmpObj.width = w;
  this.tmpObj.height = h;
  return this.tmpObj;
}

AddedText.prototype.handleBoundingBox = function(){
  if (!this.boundingBox){
    this.boundingBox = new THREE.Box3();
  }else{
    this.boundingBox.makeEmpty();
  }
  var cSize = this.calculateCharSize();
  REUSABLE_VECTOR.copy(this.topLeft)
  REUSABLE_VECTOR_2.copy(this.bottomRight);
  REUSABLE_VECTOR.x -= cSize.width / 2;
  REUSABLE_VECTOR.y += cSize.height / 2;
  REUSABLE_VECTOR_2.x += cSize.width / 2;
  REUSABLE_VECTOR_2.y -= cSize.height / 2;
  this.line.set(REUSABLE_VECTOR, REUSABLE_VECTOR_2);
  this.matrix4.compose(REUSABLE_VECTOR_3.set(0, 0, 0), camera.quaternion, this.mesh.scale);
  this.line.applyMatrix4(this.matrix4);
  this.boundingBox.expandByPoint(this.line.start);
  this.boundingBox.expandByPoint(this.line.end);
}