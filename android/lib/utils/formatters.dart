String formatName(String name) {
  var actualName = name.split(' ')[0];
  if (actualName.endsWith('s')) {
    return "$actualName'";
  }
  return "${actualName}s";
}
