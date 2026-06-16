import 'package:eva_icons_flutter/eva_icons_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_week_view/flutter_week_view.dart';
import 'package:intl/intl.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';
import 'package:lectio_wrapper/types/weeks/calendar_event.dart';
import 'package:betterlectio/topics/modul/screens/modul_details_screen.dart';
import 'package:betterlectio/utils/ad_route.dart';
import 'package:betterlectio/widgets/primitive/team_name.dart';

Color colorFromStatus(String status, BuildContext context) {
  var colorScheme = Theme.of(context).colorScheme;
  switch (status) {
    case 'Aflyst!':
      return colorScheme.error;
    case 'Ændret!':
      return colorScheme.tertiaryContainer;
    default:
      return colorScheme.primaryContainer;
  }
}

Color textColorFromStatus(String status, BuildContext context) {
  var colorScheme = Theme.of(context).colorScheme;
  switch (status) {
    case 'Aflyst!':
      return colorScheme.onError;
    case 'Ændret!':
      return colorScheme.onTertiaryContainer;
    default:
      return colorScheme.onPrimaryContainer;
  }
}

final DateFormat hF = DateFormat("HH:mm");

FlutterWeekViewEvent buildDayEvent(
    BuildContext context, CalendarEvent dayEvent) {
  return FlutterWeekViewEvent(
      padding: null,
      eventTextBuilder: (event, context, dayView, height, width) {
        return dayEventWidget(width, dayEvent, context, height);
      },
      margin: const EdgeInsets.all(4.0).copyWith(top: 0, bottom: 0),
      backgroundColor: Colors.transparent,
      title: '',
      description: "",
      start: dayEvent.start,
      end: dayEvent.end);
}

Widget dayEventWidget(
    double width, CalendarEvent dayEvent, BuildContext context, double height) {
  var canceled = dayEvent.status == "Aflyst!";
  var textColor = textColorFromStatus(dayEvent.status, context);
  TextStyle style = TextStyle(
    overflow: TextOverflow.ellipsis,
    decoration: canceled ? TextDecoration.lineThrough : null,
    decorationColor: textColor,
    color: textColor,
  );
  return Container(
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(8.0),
      color: colorFromStatus(dayEvent.status, context),
    ),
    width: width,
    height: height,
    child: InkWell(
      onTap: () {
        Navigator.push(context,
            adRoute(ModulDetailsScreen(event: dayEvent), onlyFromEdge: true));
      },
      child: Padding(
        padding: const EdgeInsets.all(8.0).copyWith(bottom: 4.0),
        child: DefaultTextStyle(
          style: style,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: ListView(
                    padding: EdgeInsets.zero,
                    primary: false,
                    children: [
                      TeamName(
                        teamName: dayEvent.team,
                        builder: (name) {
                          return Text(
                            "$name${ine(dayEvent.title) ? " - ${dayEvent.title}" : ""}",
                            style: const TextStyle(fontWeight: FontWeight.w500),
                          );
                        },
                      ),
                      Text(
                          "${hF.format(dayEvent.start)}-${hF.format(dayEvent.end)}"),
                      if (dayEvent.room.isNotEmpty)
                        Wrap(
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            Icon(
                              EvaIcons.pinOutline,
                              size: 14.0,
                              color: textColor,
                            ),
                            Padding(
                              padding: const EdgeInsets.only(left: 2.0),
                              child: Text(
                                dayEvent.room,
                                overflow: TextOverflow.ellipsis,
                              ),
                            )
                          ],
                        )
                    ]),
              ),
              Padding(
                padding: const EdgeInsets.only(left: 4.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    if (dayEvent.hasNote)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 4.0),
                        child: Icon(
                          EvaIcons.alertCircleOutline,
                          size: 16.0,
                          color: textColor,
                        ),
                      ),
                    if (dayEvent.hasHomework)
                      Icon(
                        EvaIcons.bookmarkOutline,
                        size: 16.0,
                        color: textColor,
                      )
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
