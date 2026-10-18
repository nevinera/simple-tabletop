// CSS that shows a manifest image (see normalizeImage in manifest.js) filling
// its element, cropped to its grid cell for sheet images.
export function imageStyle(image) {
  if (!image) return {};
  const style = { backgroundImage: `url("${image.url.replaceAll('"', "%22")}")`, backgroundRepeat: "no-repeat" };
  if (image.index == null) return { ...style, backgroundSize: "100% 100%" };
  const column = image.index % image.columns;
  const row = Math.floor(image.index / image.columns);
  const percent = (cell, cells) => (cells > 1 ? (cell / (cells - 1)) * 100 : 0);
  return {
    ...style,
    backgroundSize: `${image.columns * 100}% ${image.rows * 100}%`,
    backgroundPosition: `${percent(column, image.columns)}% ${percent(row, image.rows)}%`,
  };
}
