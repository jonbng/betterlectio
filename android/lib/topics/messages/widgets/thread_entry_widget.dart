import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lectio_wrapper/types/message/message.dart';
import 'package:betterlectio/topics/messages/widgets/message_files.dart';
import 'package:betterlectio/topics/modul/widgets/module_homework_display.dart';
import 'package:betterlectio/topics/people/widget/person_details.dart';
import 'package:betterlectio/utils/ad_route.dart';

class ThreadEntryWidget extends StatelessWidget {
  const ThreadEntryWidget({super.key, required this.entry});
  final ThreadEntry entry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(4.0),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          clipBehavior: Clip.hardEdge,
          decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(double.infinity)),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: () {
              adSheet(
                  PersonDetails(
                    entry: entry.user,
                  ),
                  context);
            },
            child: CircleAvatar(
              child: Text(entry.user.name
                  .split(" ")
                  .map((e) => e.characters.first)
                  .take(2)
                  .join()),
            ),
          ),
        ),
        Expanded(
          child: Card(
              margin: const EdgeInsets.only(left: 8.0),
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(vertical: 8.0, horizontal: 16.0),
                child: Column(
                  mainAxisSize: MainAxisSize.max,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Wrap(
                      alignment: WrapAlignment.spaceBetween,
                      children: [
                        Text(
                          entry.topic,
                          style: Theme.of(context).textTheme.labelLarge,
                        ),
                        Text(DateFormat("d/M HH:mm").format(entry.at),
                            style: Theme.of(context).textTheme.labelMedium)
                      ],
                    ),
                    LppHtml(content: entry.content),
                    MessageFileRow(files: entry.files)
                  ],
                ),
              )),
        ),
      ]),
    );
  }
}
