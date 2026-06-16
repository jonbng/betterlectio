import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';
import 'package:betterlectio/topics/homework/bloc/homework_bloc.dart';
import 'package:betterlectio/topics/modul/screens/modul_details_screen.dart';
import 'package:betterlectio/utils/ad_route.dart';
import 'package:betterlectio/widgets/primitive/team_name.dart';

final DateFormat hourFormats = DateFormat("HH:mm");
final DateFormat dayFormats = DateFormat("dd/MM");

class HomeworkItem extends StatelessWidget {
  const HomeworkItem({super.key, required this.homework});
  final Homework homework;
  @override
  Widget build(BuildContext context) {
    return BlocBuilder<HomeworkManagerBloc, List<ManagedHomework>>(
        builder: (context, state) {
      return TeamName(
        teamName: homework.activity.team,
        builder: (name) {
          return Card(
              clipBehavior: Clip.hardEdge,
              margin:
                  const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
              child: InkWell(
                onTap: () {
                  Navigator.push(
                      context,
                      adRoute(
                          ModulDetailsScreen(
                            event: homework.activity,
                            homework: true,
                          ),
                          onlyFromEdge: true));
                },
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              name,
                              style: Theme.of(context).textTheme.titleMedium!,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ));
        },
      );
    });
  }
}
