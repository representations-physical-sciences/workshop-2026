(async () => {
  const host = document.querySelector('[data-hero-animation]');
  if (!host) return;

  // Keep the SVG visible until the first successful WebGL frame.
  let THREE;
  try {
    THREE = await import('https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js');
  } catch {
    return;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'hero-webgl';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1.2, 0.1, 40);
  camera.position.set(0, 0, 13);
  camera.updateMatrixWorld();
  const sculpture = new THREE.Group();
  scene.add(sculpture);

  // Soft luminous discs stay crisp without requiring expensive lighting or post-processing.
  const nodeCanvas = document.createElement('canvas');
  nodeCanvas.width = nodeCanvas.height = 128;
  const nodeContext = nodeCanvas.getContext('2d');
  const halo = nodeContext.createRadialGradient(64, 64, 0, 64, 64, 64);
  halo.addColorStop(0, 'rgba(255,255,255,1)');
  halo.addColorStop(0.29, 'rgba(255,255,255,1)');
  halo.addColorStop(0.34, 'rgba(255,255,255,.35)');
  halo.addColorStop(0.62, 'rgba(255,255,255,.09)');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  nodeContext.fillStyle = halo;
  nodeContext.fillRect(0, 0, 128, 128);
  const nodeTexture = new THREE.CanvasTexture(nodeCanvas);
  nodeTexture.colorSpace = THREE.SRGBColorSpace;

  const spriteMaterial = (color) => new THREE.SpriteMaterial({ map: nodeTexture, color, transparent: true, depthWrite: false });
  const accentNode = spriteMaterial(0x1745c6);
  const secondaryNode = spriteMaterial(0x3557b8);
  const moleculeNode = spriteMaterial(0xc65b36);
  const moleculeSecondary = spriteMaterial(0xe39a78);
  const latticeNode = spriteMaterial(0x187d75);
  const latticeSecondary = spriteMaterial(0x65aaa0);
  const wire = new THREE.LineBasicMaterial({ color: 0x1745c6, transparent: true, opacity: 0.4 });
  const brightWire = new THREE.LineBasicMaterial({ color: 0x1745c6, transparent: true, opacity: 0.82 });
  const moleculeWire = new THREE.LineBasicMaterial({ color: 0xc65b36, transparent: true, opacity: 0.72 });
  const latticeWire = new THREE.LineBasicMaterial({ color: 0x187d75, transparent: true, opacity: 0.68 });
  const neuronMaterials = [0x343b46, 0x5b6470, 0x858e99].map(spriteMaterial);
  const networkWire = new THREE.LineBasicMaterial({ color: 0x525c69, transparent: true, opacity: 0.2, depthWrite: false });
  const activeWire = new THREE.LineBasicMaterial({ color: 0x1745c6, transparent: true, opacity: 0.42, depthWrite: false });

  const bead = (parent, position, material = accentNode, scale = 1) => {
    const point = new THREE.Sprite(material);
    point.position.copy(position);
    point.scale.set(0.27 * scale, 0.27 * scale, 1);
    parent.add(point);
    return point;
  };
  const line = (parent, points, material = wire) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const object = new THREE.Line(geometry, material);
    parent.add(object);
    return object;
  };
  const v = (x, y, z = 0) => new THREE.Vector3(x, y, z);

  // Dense adjacent-layer connections make this read as a neural network, not a tree.
  const network = new THREE.Group();
  sculpture.add(network);
  const layers = [];
  const neurons = [];
  const counts = [10, 8, 6, 3];
  const heights = [4.0, 3.05, 2.05, 0.9];
  counts.forEach((count, layer) => {
    const nodes = [];
    for (let i = 0; i < count; i++) {
      const point = v(-1.05 + layer * 0.87, (i / (count - 1) - 0.5) * heights[layer], (i % 2 ? -1 : 1) * (0.23 - layer * 0.04));
      const scale = layer === 3 ? 1.5 : 1.2;
      const material = layer === 3 ? accentNode : neuronMaterials[(i + layer) % 3];
      const mesh = bead(network, point, material, scale);
      neurons.push({ home: point.clone(), position: point, velocity: v(0, 0), mesh, phase: i * 1.7 + layer, scale });
      nodes.push(point);
    }
    layers.push(nodes);
  });
  const edges = [];
  layers.slice(0, -1).forEach((nodes, layer) => {
    const next = layers[layer + 1];
    nodes.forEach((start) => next.forEach((end) => edges.push([start, end])));
  });
  const edgePositions = new Float32Array(edges.length * 6);
  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3).setUsage(THREE.DynamicDrawUsage));
  const connections = new THREE.LineSegments(edgeGeometry, networkWire);
  connections.frustumCulled = false;
  network.add(connections);

  // A subset of pathways stays illuminated as signals travel between layers.
  const activeEdges = edges.filter((_, i) => i % 8 === Math.floor(i / 8) % 8);
  const activePositions = new Float32Array(activeEdges.length * 6);
  const activeGeometry = new THREE.BufferGeometry();
  activeGeometry.setAttribute('position', new THREE.BufferAttribute(activePositions, 3).setUsage(THREE.DynamicDrawUsage));
  const activeConnections = new THREE.LineSegments(activeGeometry, activeWire);
  activeConnections.frustumCulled = false;
  network.add(activeConnections);
  const signals = activeEdges.filter((_, i) => i % 2 === 0).map(([start, end], i) => ({
    mesh: bead(network, start, accentNode, 0.58), start, end, phase: i * 0.618,
  }));

  // Three distinct physical inputs: a waveform, a molecule, and a crystal lattice.
  const inputs = new THREE.Group();
  sculpture.add(inputs);
  const waveGeometry = new THREE.BufferGeometry();
  const wavePositions = new Float32Array(72 * 3);
  waveGeometry.setAttribute('position', new THREE.BufferAttribute(wavePositions, 3));
  const wave = new THREE.Line(waveGeometry, brightWire);
  inputs.add(wave);

  const molecule = new THREE.Group();
  molecule.position.set(-2.65, 0, 0);
  inputs.add(molecule);
  const atoms = [v(-0.34, 0.12, 0.1), v(0.08, 0.32, -0.16), v(0.35, -0.1, 0.1), v(-0.05, -0.34, -0.18)];
  atoms.forEach((point, i) => bead(molecule, point, i ? moleculeSecondary : moleculeNode, i ? 1.05 : 1.55));
  [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2]].forEach(([a, b]) => line(molecule, [atoms[a], atoms[b]], moleculeWire));

  const lattice = new THREE.Group();
  lattice.position.set(-2.65, -1.38, 0);
  lattice.rotation.set(0.4, 0.4, 0.1);
  inputs.add(lattice);
  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 3; y++) {
      const point = v((x - 1) * 0.27, (y - 1) * 0.27, 0);
      bead(lattice, point, (x + y) % 2 ? latticeSecondary : latticeNode, 0.72);
      if (x < 2) line(lattice, [point, point.clone().add(v(0.27, 0))], latticeWire);
      if (y < 2) line(lattice, [point, point.clone().add(v(0, 0.27))], latticeWire);
    }
  }

  const intake = [1.35, 0, -1.35].map((y) => new THREE.CubicBezierCurve3(
    v(-2.1, y), v(-1.65, y), v(-1.7, y * 0.6, 0.2), v(-1.05, y * 0.55, 0.3)
  ));
  const intakeMaterials = [brightWire, moleculeWire, latticeWire];
  intake.forEach((curve, i) => line(sculpture, curve.getPoints(40), intakeMaterials[i]));
  const intakeSignals = intake.map((curve, i) => ({
    curve, mesh: bead(sculpture, curve.getPoint(0), [accentNode, moleculeNode, latticeNode][i], 0.72), phase: i / 3,
  }));

  // The compressed representation exits as two crisp binary channels.
  const output = new THREE.Group();
  sculpture.add(output);
  const bitTextures = ['0', '1'].map((digit) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    context.font = '600 72px "SFMono-Regular", Consolas, monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#ffffff';
    context.fillText(digit, 32, 49);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  });
  const encoding = '10110010101001101001';
  const bits = Array.from(encoding, (digit, i) => {
    const material = new THREE.SpriteMaterial({ map: bitTextures[Number(digit)], color: 0x1745c6, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.155, 0.232, 1);
    output.add(sprite);
    return { sprite, phase: (i % 10) / 10, row: Math.floor(i / 10) };
  });
  [-0.15, 0.15].forEach((y) => line(output, [v(1.65, y), v(3.4, y)], wire));

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = new THREE.Vector2();
  const tilt = new THREE.Vector2();
  const neutralPointer = new THREE.Vector2();
  const rayPointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const interactionPlane = new THREE.Plane(v(0, 0, 1), 0);
  const cursorWorld = v(0, 0);
  const cursorLocal = v(0, 0);
  const projected = v(0, 0);
  const displacement = v(0, 0);
  const target = v(0, 0);
  let pointerActive = false;
  let visible = true;
  let time = 0;
  let lastFrame = null;
  let contextLost = false;

  const render = (stamp = performance.now()) => {
    const dt = lastFrame === null ? 0 : Math.max(0, Math.min((stamp - lastFrame) / 1000, 0.05));
    lastFrame = stamp;
    if (!motion.matches) time += dt;
    const smoothing = motion.matches ? 1 : 1 - Math.exp(-dt * 5);
    tilt.lerp(motion.matches ? neutralPointer : pointer, smoothing);
    sculpture.rotation.set(-0.12 + tilt.y * 0.1, -0.22 + tilt.x * 0.16, -0.045);
    network.rotation.y = Math.sin(time * 0.22) * 0.1;
    network.rotation.x = Math.sin(time * 0.18) * 0.055;
    sculpture.updateMatrixWorld(true);
    rayPointer.set(pointer.x, -pointer.y);
    raycaster.setFromCamera(rayPointer, camera);
    const cursorOnPlane = pointerActive && !motion.matches && raycaster.ray.intersectPlane(interactionPlane, cursorWorld);
    if (cursorOnPlane) cursorLocal.copy(network.worldToLocal(cursorWorld));
    neurons.forEach((neuron) => {
      target.copy(neuron.home);
      if (cursorOnPlane) {
        projected.copy(neuron.position);
        network.localToWorld(projected);
        projected.project(camera);
        const distance = Math.hypot((projected.x - pointer.x) * camera.aspect, projected.y + pointer.y);
        const influence = Math.max(0, 1 - distance / 0.38);
        displacement.copy(neuron.home).sub(cursorLocal);
        displacement.z = 0;
        if (displacement.lengthSq() < 0.001) displacement.set(Math.cos(neuron.phase), Math.sin(neuron.phase), 0);
        displacement.normalize().multiplyScalar(influence * influence * 0.75);
        target.add(displacement);
        target.z += Math.sin(time * 3 + neuron.phase) * influence * 0.45;
      }
      if (motion.matches) {
        neuron.position.copy(neuron.home);
        neuron.velocity.set(0, 0, 0);
      } else if (dt > 0) {
        const steps = Math.ceil(dt / 0.012);
        const step = dt / steps;
        for (let i = 0; i < steps; i++) {
          displacement.copy(target).sub(neuron.position).multiplyScalar(65);
          neuron.velocity.addScaledVector(displacement, step).multiplyScalar(Math.exp(-step * 12));
          neuron.position.addScaledVector(neuron.velocity, step);
        }
      }
      neuron.mesh.position.copy(neuron.position);
      const pulse = 1 + Math.sin(time * 1.7 + neuron.phase) * 0.055;
      neuron.mesh.scale.set(0.27 * neuron.scale * pulse, 0.27 * neuron.scale * pulse, 1);
    });
    edges.forEach(([start, end], i) => {
      start.toArray(edgePositions, i * 6);
      end.toArray(edgePositions, i * 6 + 3);
    });
    edgeGeometry.attributes.position.needsUpdate = true;
    activeEdges.forEach(([start, end], i) => {
      start.toArray(activePositions, i * 6);
      end.toArray(activePositions, i * 6 + 3);
    });
    activeGeometry.attributes.position.needsUpdate = true;
    molecule.rotation.y = time * 0.32;
    lattice.rotation.y = 0.4 + Math.sin(time * 0.35) * 0.22;
    for (let i = 0; i < 72; i++) {
      const u = i / 71;
      wavePositions[i * 3] = -3.25 + u * 1.18;
      wavePositions[i * 3 + 1] = 1.35 + Math.sin(u * Math.PI * 4 - time * 1.5) * Math.sin(u * Math.PI) * 0.25;
      wavePositions[i * 3 + 2] = Math.cos(u * Math.PI * 4 - time * 1.5) * 0.1;
    }
    waveGeometry.attributes.position.needsUpdate = true;
    signals.forEach(({ mesh, start, end, phase }) => mesh.position.lerpVectors(start, end, (time * 0.3 + phase) % 1));
    intakeSignals.forEach(({ mesh, curve, phase }) => mesh.position.copy(curve.getPoint((time * 0.23 + phase) % 1)));
    bits.forEach(({ sprite, phase, row }) => {
      const u = (phase + time * 0.13) % 1;
      sprite.position.set(1.65 + u * 1.75, row ? -0.15 : 0.15, 0.05);
      sprite.material.opacity = Math.min(1, u * 10, (1 - u) * 10);
    });
    renderer.render(scene, camera);
  };

  const updateLoop = () => {
    renderer.setAnimationLoop(null);
    lastFrame = null;
    if (contextLost) return;
    if (visible && !document.hidden && !motion.matches) renderer.setAnimationLoop(render);
    else render();
  };
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height || contextLost) return;
    camera.aspect = width / height;
    const halfHeight = Math.max(3.0, 3.6 / camera.aspect);
    camera.position.z = halfHeight / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    renderer.setSize(width, height, false);
    render();
  };
  const applyTheme = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    const colors = dark
      ? { accent: 0x9bb2ff, secondary: 0xc1d0ff, molecule: 0xffad8a, moleculeSoft: 0xffc7ae, lattice: 0x7cd8c8, latticeSoft: 0xa5e4d9 }
      : { accent: 0x1745c6, secondary: 0x3557b8, molecule: 0xc65b36, moleculeSoft: 0xd77b54, lattice: 0x187d75, latticeSoft: 0x438f86 };
    accentNode.color.set(colors.accent);
    secondaryNode.color.set(colors.secondary);
    moleculeNode.color.set(colors.molecule);
    moleculeSecondary.color.set(colors.moleculeSoft);
    latticeNode.color.set(colors.lattice);
    latticeSecondary.color.set(colors.latticeSoft);
    [wire, brightWire].forEach((material) => material.color.set(colors.accent));
    moleculeWire.color.set(colors.molecule);
    latticeWire.color.set(colors.lattice);
    wire.opacity = dark ? 0.4 : 0.42;
    brightWire.opacity = dark ? 0.76 : 0.88;
    moleculeWire.opacity = latticeWire.opacity = dark ? 0.68 : 0.76;
    const grayPalette = dark ? [0xe1e4e9, 0xb7bec9, 0x8d96a4] : [0x343b46, 0x5b6470, 0x858e99];
    neuronMaterials.forEach((material, i) => material.color.set(grayPalette[i]));
    networkWire.color.set(dark ? 0xabb4c1 : 0x525c69);
    networkWire.opacity = dark ? 0.22 : 0.2;
    activeWire.color.set(colors.accent);
    activeWire.opacity = dark ? 0.34 : 0.42;
    bits.forEach(({ sprite }) => sprite.material.color.copy(accentNode.color));
    if (!contextLost) render();
  };

  host.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    pointerActive = true;
    const rect = host.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, (event.clientY - rect.top) / rect.height * 2 - 1);
  }, { passive: true });
  const releasePointer = () => { pointerActive = false; pointer.set(0, 0); };
  host.addEventListener('pointerleave', releasePointer);
  host.addEventListener('pointercancel', releasePointer);
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    renderer.setAnimationLoop(null);
    host.classList.remove('is-3d-ready');
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    resize();
    applyTheme();
    host.classList.add('is-3d-ready');
    updateLoop();
  });
  new ResizeObserver(resize).observe(host);
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    updateLoop();
  }).observe(host);
  document.addEventListener('visibilitychange', updateLoop);
  motion.addEventListener('change', updateLoop);
  window.addEventListener('pagehide', () => renderer.setAnimationLoop(null));
  window.addEventListener('pageshow', updateLoop);
  resize();
  applyTheme();
  host.classList.add('is-3d-ready');
  updateLoop();
})();
