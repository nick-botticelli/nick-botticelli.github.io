var is_iOS = (/iPad|iPhone|iPod/.test(navigator.platform) ||
(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) &&
!window.MSStream;

function goTo(link) {
    location.href = link;
}

function is_iOS() {
  return [
    'iPad Simulator',
    'iPhone Simulator',
    'iPod Simulator',
    'iPad',
    'iPhone',
    'iPod'
  ].includes(navigator.platform)
  // iPad on iOS 13 detection
  || (navigator.userAgent.includes("Mac") && "ontouchend" in document && navigator.maxTouchPoints > 2)
}



//////////   WebGL   //////////

const vertexShader = `
precision mediump float;
attribute vec2 a_position;
uniform vec2 u_resolution;
uniform float u_time;
varying vec2 v_resolution;
varying float v_time;
void main(void){
  gl_Position=vec4(a_position,0., 1.);
  v_resolution=u_resolution;
  v_time=u_time;
}`;

const fragmentShader = `
precision mediump float;
varying highp vec2 v_texCoord;
varying vec2 v_resolution;
varying float v_time;

float psrdnoise(vec2 x, vec2 period, float alpha, out vec2 gradient)
{
  vec2 uv = vec2(x.x+x.y*0.5, x.y);
  vec2 i0 = floor(uv), f0 = fract(uv);
  float cmp = step(f0.y, f0.x);
  vec2 o1 = vec2(cmp, 1.-cmp);
  vec2 i1 = i0 + o1, i2 = i0 + 1.0;
  vec2 v0 = vec2(i0.x - i0.y*0.5, i0.y);
  vec2 v1 = vec2(v0.x + o1.x - o1.y*0.5, v0.y + o1.y);
  vec2 v2 = vec2(v0.x + 0.5, v0.y + 1.);
  vec2 x0 = x - v0, x1 = x - v1, x2 = x - v2;
  vec3 iu, iv, xw, yw;
  if(any(greaterThan(period, vec2(0.)))) {
    xw = vec3(v0.x, v1.x, v2.x);
    yw = vec3(v0.y, v1.y, v2.y);
    if(period.x > 0.0)
    xw = mod(vec3(v0.x, v1.x, v2.x), period.x);
    if(period.y > 0.0)
      yw = mod(vec3(v0.y, v1.y, v2.y), period.y);
    iu = floor(xw + 0.5*yw + 0.5); iv = floor(yw + 0.5);
  } else {
    iu = vec3(i0.x, i1.x, i2.x); iv = vec3(i0.y, i1.y, i2.y);
  }
  vec3 hash = mod(iu, 289.0);
  hash = mod((hash*51.0 + 2.0)*hash + iv, 289.0);
  hash = mod((hash*34.0 + 10.0)*hash, 289.0);
  vec3 psi = hash*0.07482 + alpha;
  vec3 gx = cos(psi); vec3 gy = sin(psi);
  vec2 g0 = vec2(gx.x, gy.x);
  vec2 g1 = vec2(gx.y, gy.y);
  vec2 g2 = vec2(gx.z, gy.z);
  vec3 w = 0.8 - vec3(dot(x0, x0), dot(x1, x1), dot(x2, x2));
  w = max(w, 0.0); vec3 w2 = w*w; vec3 w4 = w2*w2;
  vec3 gdotx = vec3(dot(g0, x0), dot(g1, x1), dot(g2, x2));
  float n = dot(w4, gdotx);
  vec3 w3 = w2*w; vec3 dw = -8.0*w3*gdotx;
  vec2 dn0 = w4.x*g0 + dw.x*x0;
  vec2 dn1 = w4.y*g1 + dw.y*x1;
  vec2 dn2 = w4.z*g2 + dw.z*x2;
  gradient = 10.9*(dn0 + dn1 + dn2);
  return 10.9*n;
}

float fbm(vec2 x,out vec2 g){
vec2 p = vec2(0.);
float alpha = v_time*.05;
float scale = .5;
float noise = 0.;
for (int i = 0;i<2;i++){
  noise += psrdnoise(x , p, alpha, g)*scale;
  x *=2.;
  scale/=2.;
  alpha *=1.3;
}
return noise;
}

vec3 pattern2(vec2 uv){
    float alpha = v_time*0.2;
    vec2 g;vec2 p = vec2(6);
    vec3 col = mix(vec3(0.,0.35,1.),vec3(1.,.15,.1),psrdnoise(uv*.5+vec2(.23,.67), p, alpha, g)*.6+.5);
    col += vec3(0.,.6,.2)*(psrdnoise(uv*.4+vec2(.092,.137), p, alpha+2., g)*0.6+.2);
    col *= clamp(length(g)*.3,0.,.7)+.4;
    float n = fbm(uv*.5,g);
    n = clamp(n*.5 + .5, .2, 1.);
    n = fract(n*10.);
    float sf = v_resolution.y/300./max(length(g), .001);
    n = min(n, n*(1. - n)*48.*sf);
    col *= n;
    col.x = pow(col.x,0.7);
    return col;
}

void main()
{
    vec2 uv = (2.*gl_FragCoord.xy - v_resolution.xy)/v_resolution.y;
    vec2 uv1 = uv*1.5;
    const vec2 p = vec2(8., 8.);
    float alpha = v_time*.1;
    vec2 g;
    float n = psrdnoise(uv1, p, alpha, g);
    vec3 col;
    col = sqrt(vec3(n*.5+.5));
    col = pattern2(uv)*1.;//colorful layer
    gl_FragColor = vec4(col,1.);
}`;

function main() {
    const canvas = document.querySelector('#gl');
    const gl = canvas.getContext('webgl');

    if (!gl) {
        alert('Unable to initialize WebGL. Your browser or device may not support it.');
        return;
    }

    const shaderProgram = initShaderProgram(gl, vertexShader, fragmentShader);
    const programInfo = {
        program: shaderProgram,
        attribLocations: {
            vertexPosition: gl.getAttribLocation(shaderProgram, 'a_position'),
        },
        uniformLocations: {
            resolution: gl.getUniformLocation(shaderProgram, 'u_resolution'),
            time: gl.getUniformLocation(shaderProgram, 'u_time'),
        },
    };
    
    const buffers = initBuffers(gl);
    
    gl.viewport(0, 0, canvas.width, canvas.height);
    
    const todayStart = new Date(new Date().setHours(0,0,0,0));
    
    function render(now) {
      drawScene(gl, programInfo, buffers, (Date.now() - todayStart.getTime()) / 1000);

      requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
}

function initBuffers(gl) {
  // Create a buffer for the square's positions.

  const positionBuffer = gl.createBuffer();

  // Select the positionBuffer as the one to apply buffer
  // operations to from here out.

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

  // Now create an array of positions for the square.

  const positions = [
     1.0,  1.0,
    -1.0,  1.0,
     1.0, -1.0,
    -1.0, -1.0,
  ];

  // Now pass the list of positions into WebGL to build the
  // shape. We do this by creating a Float32Array from the
  // JavaScript array, then use it to fill the current buffer.

  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

  return {
    position: positionBuffer
  };
}

function drawScene(gl, programInfo, buffers, deltaTime) {
  //gl.clearColor(0.33, 0.0, 0.0, 1.0);  // Clear to black, fully opaque
  //gl.clearDepth(1.0);                 // Clear everything

  // Clear the canvas before we start drawing on it.
  //gl.clear(gl.COLOR_BUFFER_BIT);

  {
    const numComponents = 2;
    const type = gl.FLOAT;
    const normalize = false;
    const stride = 0;
    const offset = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(
        programInfo.attribLocations.vertexPosition,
        numComponents,
        type,
        normalize,
        stride,
        offset);
    gl.enableVertexAttribArray(
        programInfo.attribLocations.vertexPosition);
  }
  
  gl.useProgram(programInfo.program);

  gl.uniform2f(
      programInfo.uniformLocations.resolution,
      gl.canvas.clientWidth, gl.canvas.clientHeight);
  gl.uniform1f(
      programInfo.uniformLocations.time,
      deltaTime);

  {
    const offset = 0;
    const vertexCount = 4;
    gl.drawArrays(gl.TRIANGLE_STRIP, offset, vertexCount);
  }
}

//
// Initialize a shader program, so WebGL knows how to draw our data
//
function initShaderProgram(gl, vsSource, fsSource) {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

  // Create the shader program

  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  // If creating the shader program failed, alert

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
    return null;
  }

  return shaderProgram;
}

//
// creates a shader of the given type, uploads the source and
// compiles it.
//
function loadShader(gl, type, source) {
  const shader = gl.createShader(type);

  // Send the source to the shader object

  gl.shaderSource(shader, source);

  // Compile the shader program

  gl.compileShader(shader);

  // See if it compiled successfully

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

if (!is_iOS) {
    (function() {
        const canvas = document.getElementById('gl');
        const context = canvas.getContext('webgl');

        // Resize the canvas to fill browser window dynamically
        
        if (!is_iOS)
            window.addEventListener('resize', resizeCanvas, false);
        
        function resizeCanvas() {
            var devicePixelRatio = window.devicePixelRatio || 1;
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            
            main();
        }
  
        resizeCanvas();
    })();
}
