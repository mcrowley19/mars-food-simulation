import * as THREE from 'three';

/**
 * Animated WebGL favicon. Runs before React mounts — must not throw: Firefox / Zen with strict
 * privacy can reject WebGL creation or canvas.toDataURL (SecurityError), which would white-screen the app.
 */
export function startMarsFavicon() {
  let renderer;
  try {
    const size = 64;
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      failIfMajorPerformanceCaveat: false,
      powerPreference: 'default',
    });
    renderer.setSize(size, size);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10);
    camera.position.z = 2.2;

    const textureLoader = new THREE.TextureLoader();
    const marsTexture = textureLoader.load('/mars-texture.jpg');

    const geometry = new THREE.SphereGeometry(0.8, 32, 32);
    const material = new THREE.MeshStandardMaterial({ map: marsTexture });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    const light = new THREE.DirectionalLight(0xffaa88, 3);
    light.position.set(2, 1, 3);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0x662222));

    const link =
      document.querySelector("link[rel='icon']") ||
      (() => {
        const l = document.createElement('link');
        l.rel = 'icon';
        document.head.appendChild(l);
        return l;
      })();

    function animate() {
      requestAnimationFrame(animate);
      try {
        sphere.rotation.y += 0.01;
        renderer.render(scene, camera);
        if (link) link.href = renderer.domElement.toDataURL('image/png');
      } catch {
        // e.g. SecurityError when privacy hardening blocks WebGL readback — keep running without updating href
      }
    }

    animate();
  } catch {
    if (renderer) renderer.dispose();
  }
}
