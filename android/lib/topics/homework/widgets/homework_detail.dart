import 'package:eva_icons_flutter/eva_icons_flutter.dart';
import 'package:flutter/material.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';
import 'package:betterlectio/topics/modul/screens/modul_lektie_screen.dart';
import 'package:betterlectio/utils/ad_route.dart';

class HomeworkDetail extends StatelessWidget {
  const HomeworkDetail(
      {super.key, required this.detail, required this.checked});
  final Detail detail;
  final bool checked;
  @override
  Widget build(BuildContext context) {
    var throughStyle = TextStyle(
        decoration: checked ? TextDecoration.lineThrough : TextDecoration.none);
    return ListTile(
      onTap: detail.href != null
          ? () {
              Navigator.push(
                  context,
                  adRoute(
                      ModulLektieScreen(
                          content: FileDetails(detail.text, detail.href!)),
                      onlyFromEdge: true));
            }
          : null,
      title: Text(
        detail.text,
        style: throughStyle,
      ),
      subtitle: detail.note != null
          ? Text(
              detail.note!,
              style: throughStyle,
            )
          : null,
      leading: detail.href != null ? const Icon(EvaIcons.link2) : null,
    );
  }
}
