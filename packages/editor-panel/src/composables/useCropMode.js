// editor/composables/useCropMode.js
// Crop mode composable - handles image/video cropping

import { ref, computed } from 'vue';
import { getEditorState } from './useEditorState.js';
import { getHistory } from './useHistory.js';
import { getVideoElement as getCaptureVideoElement } from '../renderer/shapes/capture.js';
import { applyInverseTiltTransform } from '../utils/hitTesting.js';

/**
 * Crop mode composable
 * Provides image/video cropping functionality
 */
export function useCropMode() {
  const { state, config } = getEditorState();
  const { saveState } = getHistory();

  // Local state refs
  const isCropping = ref(false);
  const cropImageIndex = ref(-1);
  const cropFrameChild = ref(null);
  const cropGroupChild = ref(null);
  const cropBounds = ref(null);
  const cropImageBounds = ref(null);
  const cropHandle = ref(null);
  const cropRotation = ref(0);
  const cropTiltX = ref(0);
  const cropTiltY = ref(0);

  // Drag state
  let cropStartBounds = null;
  let cropStartPos = null;

  /**
   * Check if a shape can be cropped
   */
  function isCroppable(shape) {
    if (!shape) return false;
    const isImage = shape.type === 'image' && shape.imageElement;
    const isVideo = shape.type === 'video' && shape.videoElement;
    const isWebcam = shape.type === 'webcamCapture';
    return isImage || isVideo || isWebcam;
  }

  /**
   * Get the video element for a webcamCapture shape
   */
  function getWebcamVideoElement(shape) {
    if (shape.type !== 'webcamCapture') return null;
    return getCaptureVideoElement(shape.id);
  }

  /**
   * Enter crop mode for a main canvas shape
   */
  function enterCropMode(imageIndex) {
    const shape = state.shapes[imageIndex];
    if (!isCroppable(shape)) return false;

    const isImage = shape.type === 'image';
    const isWebcam = shape.type === 'webcamCapture';

    // Get media element based on type
    let mediaElement;
    if (isImage) {
      mediaElement = shape.imageElement;
    } else if (isWebcam) {
      mediaElement = getWebcamVideoElement(shape);
    } else {
      mediaElement = shape.videoElement;
    }

    if (!mediaElement) return false;

    // For webcamCapture with viewport-fixed positioning, convert to regular world coordinates
    // This "detaches" it from the viewport corner so cropping works with stable coordinates
    if (isWebcam && (shape.viewportMarginRight !== undefined || shape.viewportMarginBottom !== undefined)) {
      // The shape's x/y should already be computed by the renderer, use those values
      // Remove viewport-fixed properties so it stays in place
      delete shape.viewportMarginRight;
      delete shape.viewportMarginBottom;
    }

    const naturalWidth = isImage ? mediaElement.naturalWidth : (mediaElement.videoWidth || shape.width);
    const naturalHeight = isImage ? mediaElement.naturalHeight : (mediaElement.videoHeight || shape.height);

    const displayWidth = shape.width || naturalWidth;
    const displayHeight = shape.height || naturalHeight;

    // Update state
    isCropping.value = true;
    cropImageIndex.value = imageIndex;
    cropFrameChild.value = null;
    cropRotation.value = shape.rotation || 0;
    cropTiltX.value = shape.tiltX || 0;
    cropTiltY.value = shape.tiltY || 0;

    // Calculate bounds
    if (shape.cropX !== undefined && shape.cropWidth !== undefined) {
      // Media has been cropped before, calculate full original bounds
      const scaleX = displayWidth / shape.cropWidth;
      const scaleY = displayHeight / shape.cropHeight;

      const fullWidth = naturalWidth * scaleX;
      const fullHeight = naturalHeight * scaleY;

      const fullX = shape.x - shape.cropX * scaleX;
      const fullY = shape.y - shape.cropY * scaleY;

      cropImageBounds.value = {
        x: fullX,
        y: fullY,
        width: fullWidth,
        height: fullHeight
      };

      cropBounds.value = {
        x: shape.x,
        y: shape.y,
        width: displayWidth,
        height: displayHeight
      };
    } else {
      // No existing crop - media bounds and crop bounds are the same
      cropImageBounds.value = {
        x: shape.x,
        y: shape.y,
        width: displayWidth,
        height: displayHeight
      };

      cropBounds.value = {
        x: shape.x,
        y: shape.y,
        width: displayWidth,
        height: displayHeight
      };
    }

    // Update global state
    state.isCropping = true;
    state.cropImageIndex = imageIndex;
    state.cropFrameChild = null;
    state.cropBounds = cropBounds.value;
    state.cropImageBounds = cropImageBounds.value;
    state.cropRotation = cropRotation.value;
    state.cropTiltX = cropTiltX.value;
    state.cropTiltY = cropTiltY.value;
    state.selectedIndices = [imageIndex];

    // Add cropping class to wrapper
    const wrapper = document.getElementById('canvas-wrapper');
    if (wrapper) {
      wrapper.classList.add('cropping');
    }

    if (typeof window.render === 'function') {
      window.render();
    }

    return true;
  }

  /**
   * Enter crop mode for an image/video inside a frame
   */
  function enterFrameChildCropMode(frameIndex, childIndex) {
    const frame = state.shapes[frameIndex];
    if (!frame || !frame.children) return false;

    const shape = frame.children[childIndex];
    if (!isCroppable(shape)) return false;

    const isImage = shape.type === 'image';
    const isWebcam = shape.type === 'webcamCapture';

    // Get media element based on type
    let mediaElement;
    if (isImage) {
      mediaElement = shape.imageElement;
    } else if (isWebcam) {
      mediaElement = getWebcamVideoElement(shape);
    } else {
      mediaElement = shape.videoElement;
    }

    if (!mediaElement) return false;

    const naturalWidth = isImage ? mediaElement.naturalWidth : (mediaElement.videoWidth || shape.width);
    const naturalHeight = isImage ? mediaElement.naturalHeight : (mediaElement.videoHeight || shape.height);

    const displayWidth = shape.width || naturalWidth;
    const displayHeight = shape.height || naturalHeight;

    // Update state
    isCropping.value = true;
    cropImageIndex.value = -1;
    cropFrameChild.value = { frameIndex, childIndex };
    cropRotation.value = (shape.rotation || 0) + (frame.rotation || 0);
    cropTiltX.value = (shape.tiltX || 0) + (frame.tiltX || 0);
    cropTiltY.value = (shape.tiltY || 0) + (frame.tiltY || 0);

    // Calculate bounds (same logic as main shape)
    if (shape.cropX !== undefined && shape.cropWidth !== undefined) {
      const scaleX = displayWidth / shape.cropWidth;
      const scaleY = displayHeight / shape.cropHeight;

      const fullWidth = naturalWidth * scaleX;
      const fullHeight = naturalHeight * scaleY;

      const fullX = shape.x - shape.cropX * scaleX;
      const fullY = shape.y - shape.cropY * scaleY;

      cropImageBounds.value = {
        x: fullX,
        y: fullY,
        width: fullWidth,
        height: fullHeight
      };

      cropBounds.value = {
        x: shape.x,
        y: shape.y,
        width: displayWidth,
        height: displayHeight
      };
    } else {
      cropImageBounds.value = {
        x: shape.x,
        y: shape.y,
        width: displayWidth,
        height: displayHeight
      };

      cropBounds.value = {
        x: shape.x,
        y: shape.y,
        width: displayWidth,
        height: displayHeight
      };
    }

    // Update global state
    state.isCropping = true;
    state.cropImageIndex = -1;
    state.cropFrameChild = { frameIndex, childIndex };
    state.cropBounds = cropBounds.value;
    state.cropImageBounds = cropImageBounds.value;
    state.cropRotation = cropRotation.value;
    state.cropTiltX = cropTiltX.value;
    state.cropTiltY = cropTiltY.value;

    // Update selection
    state.selectedIndices = [];
    state.selectedFrameChildren = [{ frameIndex, childIndex }];

    const wrapper = document.getElementById('canvas-wrapper');
    if (wrapper) {
      wrapper.classList.add('cropping');
    }

    if (typeof window.render === 'function') {
      window.render();
    }

    return true;
  }

  /**
   * Enter crop mode for an image/video inside a group
   */
  function enterCropModeForGroupChild(groupIndex, childIndex) {
    const group = state.shapes[groupIndex];
    if (!group || !group.children) return false;

    const shape = group.children[childIndex];
    if (!isCroppable(shape)) return false;

    const isImage = shape.type === 'image';
    const isWebcam = shape.type === 'webcamCapture';

    // Get media element based on type
    let mediaElement;
    if (isImage) {
      mediaElement = shape.imageElement;
    } else if (isWebcam) {
      mediaElement = getWebcamVideoElement(shape);
    } else {
      mediaElement = shape.videoElement;
    }

    if (!mediaElement) return false;

    const naturalWidth = isImage ? mediaElement.naturalWidth : (mediaElement.videoWidth || shape.width);
    const naturalHeight = isImage ? mediaElement.naturalHeight : (mediaElement.videoHeight || shape.height);

    const displayWidth = shape.width || naturalWidth;
    const displayHeight = shape.height || naturalHeight;

    // Update state
    isCropping.value = true;
    cropImageIndex.value = -1;
    cropFrameChild.value = null;
    cropGroupChild.value = { groupIndex, childIndex };
    cropRotation.value = (shape.rotation || 0) + (group.rotation || 0);
    cropTiltX.value = (shape.tiltX || 0) + (group.tiltX || 0);
    cropTiltY.value = (shape.tiltY || 0) + (group.tiltY || 0);

    // Calculate bounds (same logic as frame child)
    if (shape.cropX !== undefined && shape.cropWidth !== undefined) {
      const scaleX = displayWidth / shape.cropWidth;
      const scaleY = displayHeight / shape.cropHeight;

      const fullWidth = naturalWidth * scaleX;
      const fullHeight = naturalHeight * scaleY;

      const fullX = shape.x - shape.cropX * scaleX;
      const fullY = shape.y - shape.cropY * scaleY;

      cropImageBounds.value = {
        x: fullX,
        y: fullY,
        width: fullWidth,
        height: fullHeight
      };

      cropBounds.value = {
        x: shape.x,
        y: shape.y,
        width: displayWidth,
        height: displayHeight
      };
    } else {
      cropImageBounds.value = {
        x: shape.x,
        y: shape.y,
        width: displayWidth,
        height: displayHeight
      };

      cropBounds.value = {
        x: shape.x,
        y: shape.y,
        width: displayWidth,
        height: displayHeight
      };
    }

    // Update global state
    state.isCropping = true;
    state.cropImageIndex = -1;
    state.cropFrameChild = null;
    state.cropGroupChild = { groupIndex, childIndex };
    state.cropBounds = cropBounds.value;
    state.cropImageBounds = cropImageBounds.value;
    state.cropRotation = cropRotation.value;
    state.cropTiltX = cropTiltX.value;
    state.cropTiltY = cropTiltY.value;

    // Update selection
    state.selectedIndices = [];
    state.selectedGroupChildren = [{ groupIndex, childIndex }];

    const wrapper = document.getElementById('canvas-wrapper');
    if (wrapper) {
      wrapper.classList.add('cropping');
    }

    if (typeof window.render === 'function') {
      window.render();
    }

    return true;
  }

  /**
   * Exit crop mode
   */
  function exitCropMode(apply = false) {
    if (!isCropping.value) return;

    // Get the shape being cropped
    let shape;
    if (cropGroupChild.value) {
      const { groupIndex, childIndex } = cropGroupChild.value;
      const group = state.shapes[groupIndex];
      shape = group?.children?.[childIndex];
    } else if (cropFrameChild.value) {
      const { frameIndex, childIndex } = cropFrameChild.value;
      const frame = state.shapes[frameIndex];
      shape = frame?.children?.[childIndex];
    } else if (cropImageIndex.value >= 0) {
      shape = state.shapes[cropImageIndex.value];
    }

    if (apply && shape && cropBounds.value && cropImageBounds.value) {
      const imgBounds = cropImageBounds.value;

      // Get media element and natural dimensions
      const isImage = shape.type === 'image' && shape.imageElement;
      const isVideo = shape.type === 'video' && shape.videoElement;
      const isWebcam = shape.type === 'webcamCapture';

      let mediaElement;
      if (isImage) {
        mediaElement = shape.imageElement;
      } else if (isWebcam) {
        mediaElement = getWebcamVideoElement(shape);
      } else {
        mediaElement = shape.videoElement;
      }

      const naturalWidth = isImage ? mediaElement.naturalWidth : (mediaElement?.videoWidth || shape.width);
      const naturalHeight = isImage ? mediaElement.naturalHeight : (mediaElement?.videoHeight || shape.height);

      // Calculate crop in original media pixel coordinates
      const scaleX = naturalWidth / imgBounds.width;
      const scaleY = naturalHeight / imgBounds.height;

      const newCropX = (cropBounds.value.x - imgBounds.x) * scaleX;
      const newCropY = (cropBounds.value.y - imgBounds.y) * scaleY;
      const newCropW = cropBounds.value.width * scaleX;
      const newCropH = cropBounds.value.height * scaleY;

      // Update shape crop values
      shape.cropX = newCropX;
      shape.cropY = newCropY;
      shape.cropWidth = newCropW;
      shape.cropHeight = newCropH;

      // Update display position/size
      shape.x = cropBounds.value.x;
      shape.y = cropBounds.value.y;
      shape.width = cropBounds.value.width;
      shape.height = cropBounds.value.height;

      saveState();
    }

    // Reset local state
    isCropping.value = false;
    cropImageIndex.value = -1;
    cropFrameChild.value = null;
    cropGroupChild.value = null;
    cropBounds.value = null;
    cropImageBounds.value = null;
    cropHandle.value = null;
    cropRotation.value = 0;
    cropTiltX.value = 0;
    cropTiltY.value = 0;
    cropStartBounds = null;
    cropStartPos = null;

    // Reset global state
    state.isCropping = false;
    state.cropImageIndex = -1;
    state.cropFrameChild = null;
    state.cropGroupChild = null;
    state.cropBounds = null;
    state.cropImageBounds = null;
    state.cropHandle = null;
    state.cropRotation = 0;
    state.cropTiltX = 0;
    state.cropTiltY = 0;

    const wrapper = document.getElementById('canvas-wrapper');
    if (wrapper) {
      wrapper.classList.remove('cropping');
    }

    if (typeof window.render === 'function') {
      window.render();
    }
    if (typeof window.renderLayersList === 'function') {
      window.renderLayersList();
    }
  }

  /**
   * Hit test for crop handles
   * Returns handle name ('nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w') or null
   */
  function hitTestCropHandle(x, y) {
    if (!isCropping.value || !cropBounds.value) return null;

    const b = cropBounds.value;
    const handleSize = 12 / state.zoom;

    // Transform to local coordinates - apply inverse transforms in reverse order
    let testX = x, testY = y;

    // Get center for transforms
    if (cropImageBounds.value) {
      const imgBounds = cropImageBounds.value;
      const centerX = imgBounds.x + imgBounds.width / 2;
      const centerY = imgBounds.y + imgBounds.height / 2;

      // 1. Tilt inverse FIRST (applied last in forward)
      if (cropTiltX.value || cropTiltY.value) {
        const transformed = applyInverseTiltTransform(testX, testY, centerX, centerY, cropTiltX.value, cropTiltY.value);
        testX = transformed.x;
        testY = transformed.y;
      }

      // 2. Rotation inverse
      if (cropRotation.value) {
        const cos = Math.cos(-cropRotation.value);
        const sin = Math.sin(-cropRotation.value);
        const dx = testX - centerX;
        const dy = testY - centerY;
        testX = centerX + dx * cos - dy * sin;
        testY = centerY + dx * sin + dy * cos;
      }
    }

    const handles = {
      'nw': { x: b.x, y: b.y },
      'ne': { x: b.x + b.width, y: b.y },
      'sw': { x: b.x, y: b.y + b.height },
      'se': { x: b.x + b.width, y: b.y + b.height },
      'n': { x: b.x + b.width / 2, y: b.y },
      's': { x: b.x + b.width / 2, y: b.y + b.height },
      'w': { x: b.x, y: b.y + b.height / 2 },
      'e': { x: b.x + b.width, y: b.y + b.height / 2 }
    };

    for (const [name, pos] of Object.entries(handles)) {
      if (testX >= pos.x - handleSize && testX <= pos.x + handleSize &&
          testY >= pos.y - handleSize && testY <= pos.y + handleSize) {
        return name;
      }
    }

    return null;
  }

  /**
   * Start crop drag operation
   */
  function startCropDrag(x, y, handle) {
    if (!isCropping.value || !cropBounds.value) return;

    cropHandle.value = handle;
    cropStartBounds = { ...cropBounds.value };

    // Transform to local coordinates - apply inverse transforms in reverse order
    let localX = x, localY = y;

    if (cropImageBounds.value) {
      const imgBounds = cropImageBounds.value;
      const centerX = imgBounds.x + imgBounds.width / 2;
      const centerY = imgBounds.y + imgBounds.height / 2;

      // 1. Tilt inverse FIRST (applied last in forward)
      if (cropTiltX.value || cropTiltY.value) {
        const transformed = applyInverseTiltTransform(localX, localY, centerX, centerY, cropTiltX.value, cropTiltY.value);
        localX = transformed.x;
        localY = transformed.y;
      }

      // 2. Rotation inverse
      if (cropRotation.value) {
        const cos = Math.cos(-cropRotation.value);
        const sin = Math.sin(-cropRotation.value);
        const dx = localX - centerX;
        const dy = localY - centerY;
        localX = centerX + dx * cos - dy * sin;
        localY = centerY + dx * sin + dy * cos;
      }
    }

    cropStartPos = { x: localX, y: localY };

    state.cropHandle = handle;
    state.cropStartBounds = cropStartBounds;
    state.cropStartPos = cropStartPos;
  }

  /**
   * Update crop during drag
   */
  function updateCropDrag(x, y) {
    if (!cropHandle.value || !cropStartBounds || !cropStartPos) return;

    // Transform to local coordinates - apply inverse transforms in reverse order
    let localX = x, localY = y;

    if (cropImageBounds.value) {
      const imgBounds = cropImageBounds.value;
      const centerX = imgBounds.x + imgBounds.width / 2;
      const centerY = imgBounds.y + imgBounds.height / 2;

      // 1. Tilt inverse FIRST (applied last in forward)
      if (cropTiltX.value || cropTiltY.value) {
        const transformed = applyInverseTiltTransform(localX, localY, centerX, centerY, cropTiltX.value, cropTiltY.value);
        localX = transformed.x;
        localY = transformed.y;
      }

      // 2. Rotation inverse
      if (cropRotation.value) {
        const cos = Math.cos(-cropRotation.value);
        const sin = Math.sin(-cropRotation.value);
        const dx = localX - centerX;
        const dy = localY - centerY;
        localX = centerX + dx * cos - dy * sin;
        localY = centerY + dx * sin + dy * cos;
      }
    }

    const dx = localX - cropStartPos.x;
    const dy = localY - cropStartPos.y;
    const b = cropStartBounds;
    const imgBounds = cropImageBounds.value;

    let newX = b.x, newY = b.y, newW = b.width, newH = b.height;

    if (cropHandle.value === 'move') {
      // Move the entire crop area
      newX = b.x + dx;
      newY = b.y + dy;

      // Constrain to image bounds
      if (imgBounds) {
        if (newX < imgBounds.x) newX = imgBounds.x;
        if (newY < imgBounds.y) newY = imgBounds.y;
        if (newX + newW > imgBounds.x + imgBounds.width) newX = imgBounds.x + imgBounds.width - newW;
        if (newY + newH > imgBounds.y + imgBounds.height) newY = imgBounds.y + imgBounds.height - newH;
      }
    } else {
      // Resize crop area
      if (cropHandle.value.includes('w')) { newX = b.x + dx; newW = b.width - dx; }
      if (cropHandle.value.includes('e')) { newW = b.width + dx; }
      if (cropHandle.value.includes('n')) { newY = b.y + dy; newH = b.height - dy; }
      if (cropHandle.value.includes('s')) { newH = b.height + dy; }

      // Prevent negative dimensions
      if (newW < 20) { newW = 20; if (cropHandle.value.includes('w')) newX = b.x + b.width - 20; }
      if (newH < 20) { newH = 20; if (cropHandle.value.includes('n')) newY = b.y + b.height - 20; }

      // Constrain to image bounds
      if (imgBounds) {
        if (newX < imgBounds.x) { newW -= (imgBounds.x - newX); newX = imgBounds.x; }
        if (newY < imgBounds.y) { newH -= (imgBounds.y - newY); newY = imgBounds.y; }
        if (newX + newW > imgBounds.x + imgBounds.width) newW = imgBounds.x + imgBounds.width - newX;
        if (newY + newH > imgBounds.y + imgBounds.height) newH = imgBounds.y + imgBounds.height - newY;
      }
    }

    cropBounds.value = { x: newX, y: newY, width: newW, height: newH };
    state.cropBounds = cropBounds.value;

    if (typeof window.render === 'function') {
      window.render();
    }
  }

  /**
   * End crop drag
   */
  function endCropDrag() {
    cropHandle.value = null;
    cropStartBounds = null;
    cropStartPos = null;

    state.cropHandle = null;
    state.cropStartBounds = null;
    state.cropStartPos = null;
  }

  /**
   * Check if point is inside crop area (for move detection)
   */
  function isPointInCropArea(x, y) {
    if (!cropBounds.value) return false;

    // Transform to local coordinates - apply inverse transforms in reverse order
    let testX = x, testY = y;

    if (cropImageBounds.value) {
      const imgBounds = cropImageBounds.value;
      const centerX = imgBounds.x + imgBounds.width / 2;
      const centerY = imgBounds.y + imgBounds.height / 2;

      // 1. Tilt inverse FIRST (applied last in forward)
      if (cropTiltX.value || cropTiltY.value) {
        const transformed = applyInverseTiltTransform(testX, testY, centerX, centerY, cropTiltX.value, cropTiltY.value);
        testX = transformed.x;
        testY = transformed.y;
      }

      // 2. Rotation inverse
      if (cropRotation.value) {
        const cos = Math.cos(-cropRotation.value);
        const sin = Math.sin(-cropRotation.value);
        const dx = testX - centerX;
        const dy = testY - centerY;
        testX = centerX + dx * cos - dy * sin;
        testY = centerY + dx * sin + dy * cos;
      }
    }

    const b = cropBounds.value;
    return testX >= b.x && testX <= b.x + b.width &&
           testY >= b.y && testY <= b.y + b.height;
  }

  // Expose globally for legacy compatibility
  if (typeof window !== 'undefined') {
    window.enterCropMode = enterCropMode;
    window.enterFrameChildCropMode = enterFrameChildCropMode;
    window.enterCropModeForGroupChild = enterCropModeForGroupChild;
    window.exitCropMode = exitCropMode;
    window.hitTestCropHandle = hitTestCropHandle;
  }

  return {
    // State refs
    isCropping,
    cropImageIndex,
    cropFrameChild,
    cropGroupChild,
    cropBounds,
    cropImageBounds,
    cropHandle,
    cropRotation,
    cropTiltX,
    cropTiltY,

    // Methods
    isCroppable,
    enterCropMode,
    enterFrameChildCropMode,
    enterCropModeForGroupChild,
    exitCropMode,
    hitTestCropHandle,
    startCropDrag,
    updateCropDrag,
    endCropDrag,
    isPointInCropArea
  };
}

// Singleton instance
let cropModeInstance = null;

/**
 * Get or create crop mode instance
 */
export function getCropMode() {
  if (!cropModeInstance) {
    cropModeInstance = useCropMode();
  }
  return cropModeInstance;
}

export default useCropMode;
