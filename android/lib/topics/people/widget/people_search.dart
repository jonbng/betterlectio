import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/lectio/student.dart';
import 'package:betterlectio/topics/people/bloc/people_bloc.dart';
import 'package:betterlectio/topics/people/widget/person_tile.dart';
import 'package:betterlectio/topics/state/empty.dart';
import 'package:betterlectio/topics/state/loading.dart';
import 'package:betterlectio/utils/helpers.dart';

class SearchPeople extends SearchDelegate<Student> {
  @override
  List<Widget>? buildActions(BuildContext context) {
    return [];
  }

  @override
  Widget? buildLeading(BuildContext context) {
    return null;
  }

  @override
  Widget buildResults(BuildContext context) {
    return Container();
  }

  @override
  Widget buildSuggestions(BuildContext context) {
    return BlocBuilder<PeopleBloc, PeopleState>(
      builder: (context, state) {
        if (state.people.isEmpty) {
          return const LoadingScreen();
        }
        var matching = state.people
            .where((element) =>
                search(query, element.name) ||
                search(query, element.info ?? ""))
            .toList();
        if (matching.isEmpty) {
          return const EmptyScreen();
        }
        return ListView.builder(
          itemCount: matching.length,
          itemBuilder: (context, index) {
            var person = matching[index];
            return PersonTile(
              person: person,
            );
          },
        );
      },
    );
  }
}
