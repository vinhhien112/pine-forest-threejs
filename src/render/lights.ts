import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PointLight,
  Scene,
  Vector3
} from "three";

export function addLighting(scene: Scene): void {
  scene.background = new Color(0x6f99b5);
  scene.fog = new Fog(new Color(0x8ea8b2), 122, 360);

  const skyBounce = new HemisphereLight(0xd2e8f0, 0x2b3b31, 1.06);
  scene.add(skyBounce);

  const softFill = new AmbientLight(0x849d8d, 0.16);
  scene.add(softFill);

  const sun = new DirectionalLight(0xffc26f, 4.8);
  sun.position.copy(new Vector3(-48, 72, -24));
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 8;
  sun.shadow.camera.far = 180;
  sun.shadow.camera.left = -95;
  sun.shadow.camera.right = 95;
  sun.shadow.camera.top = 95;
  sun.shadow.camera.bottom = -95;
  sun.shadow.bias = -0.00018;
  sun.shadow.intensity = 0.76;
  sun.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = true;
  scene.add(sun);

  const warmRavineBounce = new PointLight(0xffb467, 12, 72, 2);
  warmRavineBounce.position.set(-15, 20, 18);
  scene.add(warmRavineBounce);

  const coolStreamFill = new PointLight(0x81bbc2, 7, 64, 2);
  coolStreamFill.position.set(8, 7, -24);
  scene.add(coolStreamFill);
}
