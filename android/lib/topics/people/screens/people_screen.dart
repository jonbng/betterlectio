import 'package:eva_icons_flutter/eva_icons_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:betterlectio/topics/people/bloc/people_bloc.dart';
import 'package:betterlectio/topics/people/widget/people_search.dart';
import 'package:betterlectio/topics/state/loading.dart';
import 'package:betterlectio/widgets/layout/appbar.dart';

import '../widget/person_tile.dart';

class PeopleScreen extends StatelessWidget {
  const PeopleScreen({super.key});

  void _search(BuildContext context) {
    showSearch(context: context, delegate: SearchPeople());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
        appBar: BlAppbar(
          title: "Personer",
          actions: [
            IconButton(
                onPressed: () {
                  _search(context);
                },
                icon: const Icon(EvaIcons.search))
          ],
        ),
        floatingActionButton: FloatingActionButton(
          child: const Icon(EvaIcons.searchOutline),
          onPressed: () {
            _search(context);
          },
        ),
        body: BlocBuilder<PeopleBloc, PeopleState>(
          builder: (context, state) {
            if (state.progress != finalPeopleProgress) {
              return LoadingScreen(
                progress: state.progress / finalPeopleProgress,
              );
            }
            return  ListView.builder(
                itemCount: state.people.length,
                itemBuilder: (context, i) {
                  return PersonTile(person: state.people.elementAt(i));
                },
              
            );
          },
        ));
  }
}
