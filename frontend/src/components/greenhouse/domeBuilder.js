import * as THREE from "three";
import { DOME_OPACITY } from "./constants";

function buildDomeInterior(radius, targetPlantCount = 60) {
  const g = new THREE.Group();
  const FLOOR_Y = 0.1;
  const floorMat = new THREE.MeshStandardMaterial({
    color: "#f1f1f1",
    roughness: 0.82,
    metalness: 0.04,
    fog: false,
  });
  const planterMat = new THREE.MeshStandardMaterial({
    color: "#6a4429",
    roughness: 0.8,
    metalness: 0.08,
    fog: false,
  });

  // Interior light so crops/planters stay visible during night and dust storms
  const interiorLight = new THREE.PointLight("#ffe8cc", 1.5, radius * 3, 1);
  interiorLight.position.set(0, radius * 0.55, 0);
  g.add(interiorLight);
  const hitGeom = new THREE.SphereGeometry(1, 6, 4);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const plantMeshes = [];
  const hitMeshes = [];
  const soilMats = [];
  const soilMeshes = [];
  const planterMeshes = [];

  const floor = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.receiveShadow = false;
  g.add(floor);

  const usableRadius = radius * 0.78;
  const MAX_PLANTERS = Math.max(targetPlantCount, 4);

  // Work out column count and plants-per-col so total slots ≈ targetPlantCount
  const estCols = Math.max(2, Math.round(Math.sqrt(targetPlantCount * 0.6)));
  const colSpacing = Math.max(1.4, (usableRadius * 2) / estCols);
  const colWidth = colSpacing * 0.7;
  const boxH = colSpacing * 0.22;
  const soilH = 0.03;
  const plantsPerCol = Math.max(2, Math.ceil(targetPlantCount / estCols));

  for (let x = -usableRadius; x <= usableRadius; x += colSpacing) {
    if (plantMeshes.length >= MAX_PLANTERS) break;

    // Calculate the length of this column based on the circular dome footprint
    const halfLen = Math.sqrt(Math.max(0, usableRadius * usableRadius - x * x));
    if (halfLen < colWidth) continue;
    const colLen = halfLen * 2;

    // Wooden border/rim around the planter
    const rimThickness = 0.08;
    const rimHeight = boxH + soilH;
    const rimMat = new THREE.MeshStandardMaterial({
      color: "#6a4429",
      roughness: 0.7,
      metalness: 0.12,
      fog: false,
    });
    const rimY = FLOOR_Y + rimHeight / 2 + 0.02;
    // Long sides (along Z)
    const sideL = new THREE.Mesh(
      new THREE.BoxGeometry(rimThickness, rimHeight, colLen),
      rimMat,
    );
    sideL.position.set(x - colWidth / 2, rimY, 0);
    g.add(sideL);
    const sideR = new THREE.Mesh(
      new THREE.BoxGeometry(rimThickness, rimHeight, colLen),
      rimMat,
    );
    sideR.position.set(x + colWidth / 2, rimY, 0);
    g.add(sideR);
    // Short ends (along X)
    const endF = new THREE.Mesh(
      new THREE.BoxGeometry(colWidth + rimThickness, rimHeight, rimThickness),
      rimMat,
    );
    endF.position.set(x, rimY, -halfLen);
    g.add(endF);
    const endB = new THREE.Mesh(
      new THREE.BoxGeometry(colWidth + rimThickness, rimHeight, rimThickness),
      rimMat,
    );
    endB.position.set(x, rimY, halfLen);
    g.add(endB);

    // Single continuous soil bed filling the planter
    const soilInnerW = colWidth - rimThickness;
    const soilMat = new THREE.MeshStandardMaterial({
      color: "#3f2a1d",
      emissive: "#000000",
      emissiveIntensity: 0,
      roughness: 0.9,
      fog: false,
    });
    const soil = new THREE.Mesh(
      new THREE.BoxGeometry(soilInnerW, boxH + soilH, colLen - rimThickness),
      soilMat,
    );
    soil.position.set(x, FLOOR_Y + (boxH + soilH) / 2 + 0.02, 0);
    g.add(soil);

    // Distribute individual plant slots along this column
    const slotsInCol = Math.min(
      plantsPerCol,
      MAX_PLANTERS - plantMeshes.length,
    );
    const slotSpacing = colLen / (slotsInCol + 1);

    for (let si = 0; si < slotsInCol; si++) {
      const z = -halfLen + slotSpacing * (si + 1);
      planterMeshes.push(soil);
      soilMats.push(soilMat);
      soilMeshes.push(soil);

      const pBase = Math.max(0.08, colWidth * 0.16);
      const plant = new THREE.Group();
      plant.position.set(x, FLOOR_Y + boxH + soilH + pBase + 0.02, z);
      plant.scale.set(pBase, pBase, pBase);
      plant.userData.isPlant = true;
      plant.userData.baseScale = pBase;
      plant.userData.visualType = "";
      plant.userData.visualMats = [];
      g.add(plant);
      plantMeshes.push(plant);

      const hitScale = pBase * 4;
      const hit = new THREE.Mesh(hitGeom, hitMat);
      hit.position.copy(plant.position);
      hit.scale.set(hitScale, hitScale, hitScale);
      hit.userData.plantIndex = plantMeshes.length - 1;
      g.add(hit);
      hitMeshes.push(hit);
    }
  }

  return {
    group: g,
    plantMeshes,
    hitMeshes,
    soilMats,
    soilMeshes,
    planterMeshes,
    interiorLight,
  };
}

export function buildSingleDome(def, cropCount = 60) {
  const { id, r } = def;
  const group = new THREE.Group();
  group.userData.domeId = id;
  group.userData.radius = r;

  const ribMat = new THREE.MeshStandardMaterial({
    color: "#aaaaaa",
    roughness: 0.4,
    metalness: 0.6,
  });

  const domeMat = new THREE.MeshPhysicalMaterial({
    color: "#88ccbb",
    transparent: true,
    opacity: DOME_OPACITY,
    roughness: 0.1,
    transmission: 0.5,
    thickness: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(r, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2),
    domeMat,
  );
  shell.castShadow = false;
  shell.name = "shell";
  group.add(shell);

  const ribs = new THREE.Group();
  ribs.name = "ribs";

  for (const deg of [12, 28, 44, 60, 76]) {
    const a = (deg * Math.PI) / 180;
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(r * Math.sin(a), 0.06, 8, 64),
      ribMat,
    );
    rib.position.y = r * Math.cos(a);
    rib.rotation.x = Math.PI / 2;
    rib.castShadow = false;
    ribs.add(rib);
  }

  for (let i = 0; i < 12; i++) {
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.06, 8, 64, Math.PI / 2),
      ribMat,
    );
    rib.rotation.set(0, (i / 12) * Math.PI * 2, 0);
    rib.castShadow = false;
    ribs.add(rib);
  }

  const baseRing = new THREE.Mesh(
    new THREE.TorusGeometry(r, 0.14, 12, 64),
    ribMat,
  );
  baseRing.rotation.x = Math.PI / 2;
  baseRing.position.y = 0.01;
  baseRing.castShadow = false;
  ribs.add(baseRing);

  group.add(ribs);

  const foundMat = new THREE.MeshStandardMaterial({
    color: "#666666",
    roughness: 0.5,
    metalness: 0.4,
  });
  const foundation = new THREE.Mesh(
    new THREE.TorusGeometry(r + 0.3, 0.3, 8, 64),
    foundMat,
  );
  foundation.rotation.x = Math.PI / 2;
  foundation.position.y = -0.05;
  foundation.receiveShadow = false;
  group.add(foundation);


  const {
    group: interiorGroup,
    plantMeshes,
    hitMeshes,
    soilMats,
    soilMeshes,
    planterMeshes,
    interiorLight,
  } = buildDomeInterior(r, cropCount);
  interiorGroup.visible = true;
  interiorGroup.name = "interior";
  group.add(interiorGroup);

  group.userData.plantMeshes = plantMeshes;
  group.userData.hitMeshes = hitMeshes;
  group.userData.soilMats = soilMats;
  group.userData.soilMeshes = soilMeshes;
  group.userData.planterMeshes = planterMeshes;
  group.userData.shellMat = domeMat;
  group.userData.interiorLight = interiorLight;

  return group;
}

function buildSilo(radius, height) {
  const group = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({
    color: "#c0c0c0",
    roughness: 0.35,
    metalness: 0.7,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: "#888888",
    roughness: 0.4,
    metalness: 0.65,
  });
  const bandMat = new THREE.MeshStandardMaterial({
    color: "#999999",
    roughness: 0.3,
    metalness: 0.75,
  });
  const legMat = new THREE.MeshStandardMaterial({
    color: "#777777",
    roughness: 0.45,
    metalness: 0.6,
  });

  // Support legs — conical hopper legs raising the body off the ground
  const legHeight = height * 0.25;
  const numLegs = 6;
  for (let i = 0; i < numLegs; i++) {
    const angle = (i / numLegs) * Math.PI * 2;
    const x = Math.cos(angle) * radius * 0.7;
    const z = Math.sin(angle) * radius * 0.7;
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.06, radius * 0.08, legHeight, 8),
      legMat,
    );
    leg.position.set(x, legHeight / 2, z);
    group.add(leg);

    // Diagonal brace from leg top to base center area
    const braceLen =
      Math.sqrt(legHeight * legHeight + radius * 0.5 * (radius * 0.5)) * 0.6;
    const brace = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.025, radius * 0.025, braceLen, 6),
      legMat,
    );
    brace.position.set(x * 0.55, legHeight * 0.55, z * 0.55);
    brace.lookAt(new THREE.Vector3(0, legHeight, 0));
    brace.rotateX(Math.PI / 2);
    group.add(brace);
  }

  // Conical hopper at the bottom of the tank
  const hopperH = height * 0.12;
  const hopper = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 0.3, hopperH, 32),
    darkMat,
  );
  hopper.position.y = legHeight + hopperH / 2;
  group.add(hopper);

  // Main cylindrical tank body
  const tankH = height * 0.55;
  const tankBase = legHeight + hopperH;
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, tankH, 32),
    hullMat,
  );
  body.position.y = tankBase + tankH / 2;
  group.add(body);

  // Horizontal structural bands around the tank
  for (const frac of [0.0, 0.25, 0.5, 0.75, 1.0]) {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(radius + 0.08, radius * 0.02, 8, 32),
      bandMat,
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = tankBase + tankH * frac;
    group.add(band);
  }

  // Flat conical roof cap
  const roofH = height * 0.08;
  const roofBase = tankBase + tankH;
  const roof = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.15, radius, roofH, 32),
    darkMat,
  );
  roof.position.y = roofBase + roofH / 2;
  group.add(roof);

  // Roof rim
  const roofRim = new THREE.Mesh(
    new THREE.TorusGeometry(radius, radius * 0.025, 8, 32),
    bandMat,
  );
  roofRim.rotation.x = Math.PI / 2;
  roofRim.position.y = roofBase;
  group.add(roofRim);

  // Small platform/railing on top
  const platY = roofBase + roofH;
  const railR = radius * 0.35;
  const rail = new THREE.Mesh(
    new THREE.TorusGeometry(railR, radius * 0.015, 6, 16),
    legMat,
  );
  rail.rotation.x = Math.PI / 2;
  rail.position.y = platY + radius * 0.08;
  group.add(rail);
  // Rail posts
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(
        radius * 0.012,
        radius * 0.012,
        radius * 0.08,
        4,
      ),
      legMat,
    );
    post.position.set(
      Math.cos(a) * railR,
      platY + radius * 0.04,
      Math.sin(a) * railR,
    );
    group.add(post);
  }

  // Small access lights/panels on the body
  const panelMat = new THREE.MeshStandardMaterial({
    color: "#ffcc66",
    roughness: 0.3,
    metalness: 0.5,
    emissive: "#ffaa22",
    emissiveIntensity: 0.3,
  });
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + 0.3;
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(radius * 0.06, radius * 0.06, radius * 0.01),
      panelMat,
    );
    panel.position.set(
      Math.cos(angle) * (radius + 0.05),
      tankBase + tankH * (0.3 + i * 0.2),
      Math.sin(angle) * (radius + 0.05),
    );
    panel.lookAt(new THREE.Vector3(0, panel.position.y, 0));
    group.add(panel);
  }

  return group;
}

export function buildColony(scene, domeDefs, cropCounts = {}) {
  const greenhouses = [];

  for (const def of domeDefs) {
    const dome = buildSingleDome(def, cropCounts[def.id] ?? 60);
    dome.position.set(def.x, 0, def.z);
    scene.add(dome);
    greenhouses.push(dome);

    // Storage silos behind the dome (negative Z = top of screen = behind)
    const siloR = def.r * 0.7;
    const siloH = siloR * 4;
    const silo = buildSilo(siloR, siloH);
    silo.position.set(def.x - def.r * 1.8, 0, def.z - def.r * 2);
    scene.add(silo);

    // Second silo touching the first on its left side
    const silo2 = buildSilo(siloR, siloH);
    silo2.position.set(def.x - def.r * 1.8 - siloR * 2, 0, def.z - def.r * 2);
    scene.add(silo2);
  }

  return greenhouses;
}
