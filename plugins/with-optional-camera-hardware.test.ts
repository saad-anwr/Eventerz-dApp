/**
 * Guards `with-optional-camera-hardware.js`.
 *
 * Worth a test because the failure is invisible everywhere a developer would
 * look. If this plugin stops emitting `required="false"`, nothing breaks: the
 * app builds, installs, and runs perfectly on the phone in your hand. The only
 * symptom is that Google Play quietly stops offering the listing to camera-less
 * devices - which you cannot see from the repo, from CI, or from a test device
 * that has a camera.
 *
 * The interesting case is the third one. Duplicate `<uses-feature>` entries for
 * one name are merged by OR-ing `required`, so a `true` left behind by any
 * future dependency would beat an appended `false` and silently restore the
 * filtering this plugin exists to remove.
 */

import { describe, expect, it } from 'vitest';
import plugin from './with-optional-camera-hardware.js';

const { markCameraOptional, IMPLIED_CAMERA_FEATURES } = plugin;

/** `{ name: required }` for every `<uses-feature>` in a manifest. */
const featureMap = (manifest: { 'uses-feature'?: { $: Record<string, string> }[] }) =>
  Object.fromEntries(
    (manifest['uses-feature'] ?? []).map((feature) => [
      feature.$['android:name'],
      feature.$['android:required'],
    ]),
  );

describe('markCameraOptional', () => {
  it('declares both features Play infers from the CAMERA permission', () => {
    // The real shipping case: no dependency declares <uses-feature> at all.
    expect(featureMap(markCameraOptional({}))).toEqual({
      'android.hardware.camera': 'false',
      'android.hardware.camera.autofocus': 'false',
    });
  });

  it('covers autofocus, not just the camera itself', () => {
    // Declaring only `android.hardware.camera` still filters fixed-focus
    // devices, so the list has to carry both.
    expect(IMPLIED_CAMERA_FEATURES).toContain('android.hardware.camera.autofocus');
  });

  it('is idempotent', () => {
    const manifest = markCameraOptional(markCameraOptional({}));
    expect(manifest['uses-feature']).toHaveLength(IMPLIED_CAMERA_FEATURES.length);
  });

  it('overrides an inherited required="true" rather than appending beside it', () => {
    const manifest = markCameraOptional({
      'uses-feature': [
        { $: { 'android:name': 'android.hardware.camera', 'android:required': 'true' } },
      ],
    });

    expect(featureMap(manifest)['android.hardware.camera']).toBe('false');
    // One entry per name - a second would be OR-merged back to `true`.
    expect(manifest['uses-feature']).toHaveLength(IMPLIED_CAMERA_FEATURES.length);
  });

  it('leaves unrelated features alone', () => {
    const manifest = markCameraOptional({
      'uses-feature': [
        { $: { 'android:name': 'android.hardware.touchscreen', 'android:required': 'true' } },
      ],
    });

    expect(featureMap(manifest)['android.hardware.touchscreen']).toBe('true');
  });
});
