String formatDateReadable(DateTime input) {
  return "${weekDays[input.weekday - 1]} ${input.day}. ${months[input.month - 1]}";
}

String standIn(String str1, String str2) {
  if (str1.isEmpty) {
    return str2;
  }
  return str1;
}

final List<String> months = [
  "Januar",
  "Februar",
  "Marts",
  "April",
  "Maj",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "December"
];
final List<String> weekDays = [
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
  "Søndag"
];

bool search(String query, String item) {
  var lowerQuery = query.toLowerCase();
  var lowerItem = item.toLowerCase();
  return lowerItem.startsWith(lowerQuery) || lowerItem.contains(lowerQuery);
}
