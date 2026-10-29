// Placed roads draw as one InstancedMesh per GLB primitive per chunk.
// A chunk is the same 20-tile block as the city ground. The mesh bounding
// sphere is the chunk, so frustum culling drops whole blocks, and the frame
// hides blocks outside the camera the same way updateChunks hides ground.

import { InstancedMesh, Matrix4, Object3D } from "three";
import { CHUNK, GROUND_H, GROUND_W, TILE } from "./constants.js";

const UNIT = 4 * TILE;
const GROUND_Y = 0.2;
const HIDDEN = new Matrix4().makeTranslation(0, -10000, 0);

function chunkKey(x, z) {
  return `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
}

function pieceMatrix(record, target) {
  const size = UNIT * (record.scale ?? 1);
  target.position.set((record.x + 0.5) * TILE, GROUND_Y, (record.z + 0.5) * TILE);
  target.rotation.set(0, record.turn * Math.PI / 2, 0);
  target.scale.set(record.mirror ? -size : size, size, size);
  target.updateMatrix();
  return target.matrix;
}

// Negative scale mirrors positions and normals, and it also reverses the
// triangle winding. Three.js flips the front face for an object whose own
// matrix has a negative determinant, which is why a carried piece stays lit.
// An InstancedMesh keeps that scale in the instance matrix, so the front face
// stays put and the mirrored piece is shaded and shadowed as a back face.
// A copy with the winding reversed puts the front face back on the outside.
function reversedWinding(geometry) {
  const copy = geometry.clone();
  const index = copy.getIndex();
  if (index) {
    const array = index.array;
    for (let i = 0; i + 2 < array.length; i += 3) {
      const first = array[i];
      array[i] = array[i + 2];
      array[i + 2] = first;
    }
    index.needsUpdate = true;
    return copy;
  }
  const position = copy.getAttribute("position");
  if (!position) return copy;
  for (let i = 0; i + 2 < position.count; i += 3) {
    for (const name of Object.keys(copy.attributes)) {
      const attribute = copy.getAttribute(name);
      if (!attribute || attribute.isInterleavedBufferAttribute) continue;
      const item = attribute.itemSize;
      for (let k = 0; k < item; k += 1) {
        const value = attribute.getComponent(i, k);
        attribute.setComponent(i, k, attribute.getComponent(i + 2, k));
        attribute.setComponent(i + 2, k, value);
      }
      attribute.needsUpdate = true;
    }
  }
  return copy;
}

function bakeTemplate(template) {
  template.updateMatrixWorld(true);
  const parts = [];
  template.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const groups = obj.geometry.groups;
    if (mats.length > 1 && groups && groups.length > 0) {
      for (const group of groups) {
        const geometry = sliceGeometry(obj.geometry, group.start, group.count);
        // Groups store the slot on materialIndex. `.material` is unset, so the
        // old lookup always used the road skin and the placed walls lost their graffiti.
        const slot = group.materialIndex ?? 0;
        parts.push({ geometry, material: mats[slot] || mats[0], local: obj.matrixWorld.clone() });
      }
      return;
    }
    parts.push({
      geometry: obj.geometry,
      material: mats[0],
      local: obj.matrixWorld.clone(),
    });
  });
  return parts;
}

function sliceGeometry(geometry, start, count) {
  const slice = geometry.clone();
  const index = slice.getIndex();
  if (!index) return slice;
  const next = index.array.slice(start, start + count);
  slice.setIndex(Array.from(next));
  slice.clearGroups();
  slice.computeBoundingSphere();
  return slice;
}

export function createRoadBatches(parent) {
  const root = new Object3D();
  root.name = "road-batches";
  parent.add(root);
  const templates = new Map();
  const baked = new Map();
  const omitted = new Set();
  const chunks = new Map();
  const dummy = new Object3D();
  const composed = new Matrix4();
  let records = [];

  function partsFor(template, mirrored) {
    let entry = baked.get(template);
    if (!entry) {
      entry = { straight: bakeTemplate(template), mirrored: null };
      baked.set(template, entry);
    }
    if (!mirrored) return entry.straight;
    if (!entry.mirrored) {
      entry.mirrored = entry.straight.map((part) => ({
        geometry: reversedWinding(part.geometry),
        material: part.material,
        local: part.local,
      }));
    }
    return entry.mirrored;
  }

  function track(record, template) {
    templates.set(record, template);
  }

  function forget(record) {
    templates.delete(record);
    omitted.delete(record);
  }

  function disposeChunk(chunk) {
    for (const mesh of chunk.meshes) {
      mesh.removeFromParent();
      mesh.dispose();
    }
    chunk.group.removeFromParent();
  }

  function commit(list) {
    records = list;
    const next = new Map();
    for (const record of list) {
      if (omitted.has(record)) continue;
      const template = templates.get(record);
      if (!template) continue;
      const key = chunkKey(record.x, record.z);
      let bucket = next.get(key);
      if (!bucket) {
        bucket = new Map();
        next.set(key, bucket);
      }
      const fileKey = `${record.kit}/${record.file}${record.mirror ? "#mirror" : ""}`;
      let group = bucket.get(fileKey);
      if (!group) {
        group = [];
        bucket.set(fileKey, group);
      }
      group.push(record);
    }

    for (const [key, chunk] of chunks) {
      if (!next.has(key)) {
        disposeChunk(chunk);
        chunks.delete(key);
      }
    }

    for (const [key, files] of next) {
      let chunk = chunks.get(key);
      if (!chunk) {
        const group = new Object3D();
        group.name = `road-chunk-${key}`;
        root.add(group);
        chunk = { group, meshes: [], files: new Map(), minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
        chunks.set(key, chunk);
      }
      const seen = new Set();
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const [fileKey, group] of files) {
        seen.add(fileKey);
        const template = templates.get(group[0]);
        const parts = partsFor(template, group[0].mirror === true);
        let batch = chunk.files.get(fileKey);
        const same = batch && batch.count === group.length && batch.parts.length === parts.length;
        if (!same) {
          if (batch) {
            for (const mesh of batch.meshes) {
              mesh.removeFromParent();
              mesh.dispose();
              const at = chunk.meshes.indexOf(mesh);
              if (at >= 0) chunk.meshes.splice(at, 1);
            }
          }
          batch = { count: group.length, parts, meshes: [], records: group };
          for (const part of parts) {
            const mesh = new InstancedMesh(part.geometry, part.material, group.length);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.frustumCulled = true;
            mesh.matrixAutoUpdate = false;
            mesh.userData.records = group;
            chunk.group.add(mesh);
            chunk.meshes.push(mesh);
            batch.meshes.push(mesh);
          }
          chunk.files.set(fileKey, batch);
        }
        batch.records = group;
        for (const mesh of batch.meshes) mesh.userData.records = group;
        for (let i = 0; i < group.length; i += 1) {
          const record = group[i];
          pieceMatrix(record, dummy);
          minX = Math.min(minX, dummy.position.x - UNIT);
          maxX = Math.max(maxX, dummy.position.x + UNIT);
          minZ = Math.min(minZ, dummy.position.z - UNIT);
          maxZ = Math.max(maxZ, dummy.position.z + UNIT);
          for (let p = 0; p < parts.length; p += 1) {
            composed.multiplyMatrices(dummy.matrix, parts[p].local);
            batch.meshes[p].setMatrixAt(i, composed);
          }
        }
        for (const mesh of batch.meshes) {
          mesh.instanceMatrix.needsUpdate = true;
          mesh.computeBoundingSphere();
        }
      }
      for (const [fileKey, batch] of chunk.files) {
        if (seen.has(fileKey)) continue;
        for (const mesh of batch.meshes) {
          mesh.removeFromParent();
          mesh.dispose();
          const at = chunk.meshes.indexOf(mesh);
          if (at >= 0) chunk.meshes.splice(at, 1);
        }
        chunk.files.delete(fileKey);
      }
      chunk.minX = minX;
      chunk.maxX = maxX;
      chunk.minZ = minZ;
      chunk.maxZ = maxZ;
    }
  }

  function update(camX, camZ, viewScale, spanW = GROUND_W, spanH = GROUND_H) {
    const view = viewScale > 0 ? viewScale : 1;
    const minX = camX - (spanW / 2) * view - TILE * 2;
    const maxX = camX + (spanW / 2) * view + TILE * 2;
    const minZ = camZ - (spanH / 2) * view - TILE * 2;
    const maxZ = camZ + (spanH / 2) * view + TILE * 5;
    for (const chunk of chunks.values()) {
      chunk.group.visible = chunk.maxX >= minX && chunk.minX <= maxX && chunk.maxZ >= minZ && chunk.minZ <= maxZ;
    }
  }

  return {
    track,
    forget,
    omit(record) {
      omitted.add(record);
    },
    include(record) {
      omitted.delete(record);
    },
    commit,
    update,
    templateFor(record) {
      return templates.get(record) || null;
    },
    // Kept so a carried piece can be dropped out of a raycast without a
    // bounding-sphere the size of the hidden matrix.
    hidden: HIDDEN,
  };
}
