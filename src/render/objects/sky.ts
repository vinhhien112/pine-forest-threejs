import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  SphereGeometry
} from "three";
import type { FrameUpdatable, WorldConfig } from "../../types";
import { createRandom } from "../../world/random";

export interface SkySystem extends FrameUpdatable {
  readonly group: Group;
  readonly triangleEstimate: number;
  readonly drawCallEstimate: number;
}

export function createSkyDetails(config: WorldConfig): SkySystem {
  const group = new Group();
  group.name = "LAAS atmosphere details";
  const random = createRandom(config.seed + 500);
  const coolMode = config.thermal === "cool";

  const cloudMaterial = new MeshStandardMaterial({
    color: 0xe6e5dd,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.72,
    emissive: new Color(0x7c8e92),
    emissiveIntensity: 0.14
  });
  const cloudGeometry = new SphereGeometry(8, 12, 7);

  const cloudCount = coolMode ? 12 : 22;
  for (let index = 0; index < cloudCount; index += 1) {
    const cloud = new Mesh(cloudGeometry, cloudMaterial);
    cloud.position.set(
      random.range(-180, 180),
      random.range(34, 68),
      random.range(75, 230)
    );
    cloud.scale.set(random.range(1.1, 3.8), random.range(0.12, 0.28), random.range(0.4, 1.4));
    group.add(cloud);
  }

  const moteGeometry = new BufferGeometry();
  const motePositions: number[] = [];
  const moteCount = coolMode ? 280 : 760;
  for (let index = 0; index < moteCount; index += 1) {
    motePositions.push(random.range(-44, 44), random.range(1.2, 18), random.range(-48, 48));
  }
  moteGeometry.setAttribute("position", new Float32BufferAttribute(motePositions, 3));

  const moteMaterial = new PointsMaterial({
    color: 0xffd991,
    size: 0.09,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: AdditiveBlending
  });
  const moteMesh = new Points(moteGeometry, moteMaterial);
  moteMesh.name = "free-floating forest pollen";
  group.add(moteMesh);

  return {
    group,
    triangleEstimate: cloudCount * geometryTriangles(cloudGeometry),
    drawCallEstimate: 2,
    update(_deltaSeconds: number, elapsedSeconds: number): void {
      group.children.forEach((child, index) => {
        if (index < cloudCount) {
          child.position.x += Math.sin(elapsedSeconds * 0.07 + index) * 0.004;
        }
      });
    }
  };
}

function geometryTriangles(geometry: SphereGeometry): number {
  const index = geometry.getIndex();
  if (index) {
    return index.count / 3;
  }

  const position = geometry.getAttribute("position");
  return position.count / 3;
}
